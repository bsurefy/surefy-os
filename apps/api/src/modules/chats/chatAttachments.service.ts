// SPDX-License-Identifier: AGPL-3.0-only
import { StorageNotFoundError } from '@/integrations/storage/index.js'
import { uuidv7 } from '@/lib/uuidv7.js'
import { CHAT_ATTACHMENT_LIMITS } from '@surefy/contracts'
import type {
  ChatAttachmentDto,
  ChatAttachmentUploadDto,
  RequestChatAttachmentUploadInput,
} from '@surefy/contracts'

import { requireUser } from './chatContext.js'
import { isTextType } from './chatDocumentParser.js'
import { chatPrefix } from './chatPurge.js'
import { UPLOAD_URL_TTL_SECONDS } from './chats.constants.js'
import {
  ChatAttachmentNotFoundError,
  ChatAttachmentTooLargeError,
  ChatAttachmentUnsupportedError,
  ChatAttachmentUploadFailedError,
  ChatMessageStateInvalidError,
  ChatNotFoundError,
} from './chats.errors.js'
import { toAttachmentDto } from './chats.mapper.js'
import {
  attachmentKindOf,
  maxBytesOf,
  sha256Of,
  signUpload,
  sniffContentType,
  verifyUpload,
} from './chats.utils.js'

import type { ChatAttachmentsRepository } from './chatAttachments.repository.js'
import type { ChatAttachmentRow } from './chats.mapper.js'
import type { ChatsRepository } from './chats.repository.js'
import type { ChatDocumentParser } from './chats.types.js'
import type { Database, DbExecutor } from '@/core/database/index.js'
import type { Logger } from '@/core/logger/index.js'
import type { StorageProvider } from '@/integrations/storage/index.js'
import type { TenantContext } from '@/types/context.js'
import type { Readable } from 'node:stream'

export const UPLOAD_PATH = '/api/v1/chat-uploads'

export interface ChatAttachmentsServiceDeps {
  db: Database
  chats: ChatsRepository
  attachments: ChatAttachmentsRepository
  storage: StorageProvider
  parser: ChatDocumentParser
  uploadKey: Buffer
  /** Enqueues the parse of a document after the transaction that set `processing` committed. */
  enqueueProcessing: (orgId: string, attachmentId: string) => Promise<void>
  logger: Logger
  now?: () => number
}

/** The signed parameters of an upload URL. */
export interface UploadParams {
  org: string
  expires: number
  signature: string
}

const objectKeyOf = (orgId: string, chatId: string, attachmentId: string) =>
  `${chatPrefix(orgId, chatId)}attachments/${attachmentId}`

async function readAll(stream: Readable): Promise<Buffer> {
  const chunks: Buffer[] = []
  const body: AsyncIterable<Buffer | string> = stream
  for await (const chunk of body)
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk)
  return Buffer.concat(chunks)
}

/**
 * Files and images in a chat (database/chat.md, §7). The bytes go to a signed route of this
 * module and on to object storage; `complete` verifies them (size, type from the bytes, sha-256),
 * and documents are read for the model, never indexed into knowledge.
 */
export class ChatAttachmentsService {
  constructor(private readonly deps: ChatAttachmentsServiceDeps) {}

  private now(): number {
    return (this.deps.now ?? Date.now)()
  }

  /** Checks type and size, inserts the row (`uploading`) and signs the upload URL. */
  async requestUpload(
    ctx: TenantContext,
    chatId: string,
    input: RequestChatAttachmentUploadInput,
    baseUrl: string,
  ): Promise<ChatAttachmentUploadDto> {
    const userId = requireUser(ctx)
    const kind = attachmentKindOf(input.contentType)
    if (kind === null) throw new ChatAttachmentUnsupportedError()
    if (input.sizeBytes > maxBytesOf(kind)) throw new ChatAttachmentTooLargeError(maxBytesOf(kind))
    const row = await this.deps.db.tenant(ctx.orgId, async (tx) => {
      await this.ensureChat(tx, ctx.orgId, userId, chatId)
      const id = uuidv7()
      return this.deps.attachments.insert(tx, {
        id,
        organizationId: ctx.orgId,
        chatId,
        uploadedByUserId: userId,
        objectKey: objectKeyOf(ctx.orgId, chatId, id),
        fileName: input.fileName,
        contentType: input.contentType,
        sizeBytes: input.sizeBytes,
        kind,
      })
    })
    return this.upload(row, baseUrl)
  }

  /** `failed → uploading`: the same row gets a new signed URL; the bytes are sent again. */
  async retry(
    ctx: TenantContext,
    chatId: string,
    attachmentId: string,
    baseUrl: string,
  ): Promise<ChatAttachmentUploadDto> {
    const userId = requireUser(ctx)
    const row = await this.deps.db.tenant(ctx.orgId, async (tx) => {
      await this.requireChat(tx, ctx.orgId, userId, chatId)
      const found = await this.deps.attachments.find(tx, ctx.orgId, chatId, attachmentId)
      if (found === undefined) throw new ChatAttachmentNotFoundError()
      if (found.status !== 'failed' || found.messageId !== null) {
        throw new ChatMessageStateInvalidError('Only a failed attachment can be retried')
      }
      const reset = await this.deps.attachments.update(tx, ctx.orgId, attachmentId, {
        status: 'uploading',
        errorCode: null,
        sha256: null,
        extractedText: null,
        pageCount: null,
      })
      if (reset === undefined) throw new ChatAttachmentNotFoundError()
      return reset
    })
    return this.upload(row, baseUrl)
  }

  /**
   * The signed `PUT` of the bytes (no session: the URL is the credential). Stores them without
   * judging them; `complete` does.
   */
  async receive(attachmentId: string, params: UploadParams, bytes: Buffer): Promise<void> {
    const row = await this.deps.db.tenant(params.org, (tx) =>
      this.deps.attachments.findById(tx, params.org, attachmentId),
    )
    const signed = {
      orgId: params.org,
      attachmentId,
      sizeBytes: row?.sizeBytes ?? 0,
      expires: params.expires,
    }
    if (
      row === undefined ||
      !verifyUpload(this.deps.uploadKey, signed, params.signature, this.now())
    ) {
      throw new ChatAttachmentNotFoundError()
    }
    if (row.status !== 'uploading') throw new ChatAttachmentNotFoundError()
    if (bytes.length > row.sizeBytes) throw new ChatAttachmentTooLargeError(row.sizeBytes)
    try {
      await this.deps.storage.put(row.objectKey, bytes, {
        contentType: row.contentType,
        size: bytes.length,
      })
    } catch (error) {
      throw new ChatAttachmentUploadFailedError({ cause: error })
    }
  }

  /**
   * Verifies the stored bytes: the size matches, the type is the real one (not the client's), and
   * the file is an accepted kind. Images are `ready`; documents are `processing` while they are
   * read (text files at once, PDF and Word files by a job). A bad file becomes `failed` with its
   * reason and the object is deleted.
   */
  async complete(
    ctx: TenantContext,
    chatId: string,
    attachmentId: string,
  ): Promise<ChatAttachmentDto> {
    const userId = requireUser(ctx)
    const { attachments } = this.deps
    const row = await this.deps.db.tenant(ctx.orgId, async (tx) => {
      await this.requireChat(tx, ctx.orgId, userId, chatId)
      return attachments.find(tx, ctx.orgId, chatId, attachmentId)
    })
    if (row === undefined) throw new ChatAttachmentNotFoundError()
    if (row.status !== 'uploading') return toAttachmentDto(row) // completing twice changes nothing
    const verified = await this.verify(row)
    if ('errorCode' in verified) {
      return this.fail(ctx.orgId, row, verified.errorCode, true)
    }
    const { bytes, contentType } = verified
    if (row.kind === 'image') {
      return this.save(ctx.orgId, attachmentId, {
        status: 'ready',
        contentType,
        sha256: sha256Of(bytes),
      })
    }
    if (!isTextType(contentType)) {
      const next = await this.save(ctx.orgId, attachmentId, {
        status: 'processing',
        contentType,
        sha256: sha256Of(bytes),
      })
      await this.deps.enqueueProcessing(ctx.orgId, attachmentId)
      return next
    }
    return this.extract(ctx.orgId, { ...row, contentType }, bytes, sha256Of(bytes))
  }

  /** The job that reads a PDF or Word file: `processing → ready | failed`. */
  async process(orgId: string, attachmentId: string): Promise<void> {
    const row = await this.deps.db.tenant(orgId, (tx) =>
      this.deps.attachments.findById(tx, orgId, attachmentId),
    )
    if (row?.status !== 'processing') return // gone, retried or already done
    let bytes: Buffer
    try {
      bytes = await readAll(await this.deps.storage.get(row.objectKey))
    } catch (error) {
      if (error instanceof StorageNotFoundError) {
        await this.fail(orgId, row, 'CHAT_ATTACHMENT_UPLOAD_FAILED', false)
        return
      }
      throw error
    }
    await this.extract(orgId, row, bytes, row.sha256 ?? sha256Of(bytes))
  }

  /** Removes an attachment that was not sent yet, with its object. */
  async remove(ctx: TenantContext, chatId: string, attachmentId: string): Promise<void> {
    const userId = requireUser(ctx)
    const row = await this.deps.db.tenant(ctx.orgId, async (tx) => {
      await this.requireChat(tx, ctx.orgId, userId, chatId)
      const found = await this.deps.attachments.find(tx, ctx.orgId, chatId, attachmentId)
      if (found === undefined) throw new ChatAttachmentNotFoundError()
      if (found.messageId !== null) {
        throw new ChatMessageStateInvalidError('An attachment that was sent stays with its message')
      }
      await this.deps.attachments.delete(tx, ctx.orgId, attachmentId)
      return found
    })
    await this.deleteObject(row.objectKey)
  }

  // ── Internals ───────────────────────────────────────────────────────────────────────────────

  /** `baseUrl` is the origin the client reached the API at, so the browser PUTs same-origin. */
  private upload(row: ChatAttachmentRow, baseUrl: string): ChatAttachmentUploadDto {
    const expires = Math.floor(this.now() / 1000) + UPLOAD_URL_TTL_SECONDS
    const url = new URL(`${UPLOAD_PATH}/${row.id}`, baseUrl)
    url.searchParams.set('org', row.organizationId)
    url.searchParams.set('expires', String(expires))
    url.searchParams.set(
      'signature',
      signUpload(this.deps.uploadKey, {
        orgId: row.organizationId,
        attachmentId: row.id,
        sizeBytes: row.sizeBytes,
        expires,
      }),
    )
    return {
      attachment: toAttachmentDto(row),
      upload: {
        url: url.toString(),
        method: 'PUT',
        headers: { 'content-type': row.contentType },
        expiresAt: new Date(expires * 1000).toISOString(),
      },
    }
  }

  /** The chat of a first attachment is created with it (`message_count = 0` until a message). */
  private async ensureChat(tx: DbExecutor, orgId: string, userId: string, chatId: string) {
    const existing = await this.deps.chats.lockOwned(tx, orgId, userId, chatId)
    if (existing !== undefined) return existing
    const created = await this.deps.chats.insert(tx, {
      id: chatId,
      organizationId: orgId,
      ownerUserId: userId,
    })
    if (created === undefined) throw new ChatNotFoundError() // the id belongs to someone else's or a deleted chat
    return created
  }

  private async requireChat(tx: DbExecutor, orgId: string, userId: string, chatId: string) {
    const chat = await this.deps.chats.findOwned(tx, orgId, userId, chatId)
    if (chat === undefined) throw new ChatNotFoundError()
    return chat
  }

  private async verify(
    row: ChatAttachmentRow,
  ): Promise<{ bytes: Buffer; contentType: string } | { errorCode: ChatAttachmentFailure }> {
    let bytes: Buffer
    try {
      bytes = await readAll(await this.deps.storage.get(row.objectKey))
    } catch (error) {
      if (error instanceof StorageNotFoundError) {
        return { errorCode: 'CHAT_ATTACHMENT_UPLOAD_FAILED' }
      }
      throw new ChatAttachmentUploadFailedError({ cause: error })
    }
    if (bytes.length !== row.sizeBytes) {
      return {
        errorCode:
          bytes.length > row.sizeBytes
            ? 'CHAT_ATTACHMENT_TOO_LARGE'
            : 'CHAT_ATTACHMENT_UPLOAD_FAILED',
      }
    }
    const contentType = sniffContentType(bytes, row.contentType)
    if (contentType === null || attachmentKindOf(contentType) !== row.kind) {
      return { errorCode: 'CHAT_ATTACHMENT_UNSUPPORTED' }
    }
    return { bytes, contentType }
  }

  private async extract(
    orgId: string,
    row: ChatAttachmentRow,
    bytes: Buffer,
    sha256: Buffer,
  ): Promise<ChatAttachmentDto> {
    try {
      const { text, pageCount } = await this.deps.parser.extract({
        orgId,
        objectKey: row.objectKey,
        contentType: row.contentType,
        bytes,
      })
      return await this.save(orgId, row.id, {
        status: 'ready',
        contentType: row.contentType,
        sha256,
        extractedText: text.slice(0, CHAT_ATTACHMENT_LIMITS.extractedTextMaxChars),
        pageCount: pageCount !== null && pageCount > 0 ? pageCount : null,
      })
    } catch (error) {
      this.deps.logger.warn({ err: error, attachmentId: row.id }, 'chat attachment unreadable')
      return this.fail(orgId, row, 'CHAT_ATTACHMENT_UNSUPPORTED', true)
    }
  }

  private async save(
    orgId: string,
    attachmentId: string,
    patch: Parameters<ChatAttachmentsRepository['update']>[3],
  ): Promise<ChatAttachmentDto> {
    const saved = await this.deps.db.tenant(orgId, (tx) =>
      this.deps.attachments.update(tx, orgId, attachmentId, { ...patch, errorCode: null }),
    )
    if (saved === undefined) throw new ChatAttachmentNotFoundError()
    return toAttachmentDto(saved)
  }

  private async fail(
    orgId: string,
    row: ChatAttachmentRow,
    errorCode: ChatAttachmentFailure,
    deleteObject: boolean,
  ): Promise<ChatAttachmentDto> {
    const saved = await this.deps.db.tenant(orgId, (tx) =>
      this.deps.attachments.update(tx, orgId, row.id, { status: 'failed', errorCode }),
    )
    if (deleteObject) await this.deleteObject(row.objectKey)
    if (saved === undefined) throw new ChatAttachmentNotFoundError()
    return toAttachmentDto(saved)
  }

  private async deleteObject(objectKey: string): Promise<void> {
    try {
      await this.deps.storage.delete(objectKey)
    } catch (error) {
      this.deps.logger.warn({ err: error, objectKey }, 'chat attachment object not deleted')
    }
  }
}

type ChatAttachmentFailure =
  'CHAT_ATTACHMENT_TOO_LARGE' | 'CHAT_ATTACHMENT_UNSUPPORTED' | 'CHAT_ATTACHMENT_UPLOAD_FAILED'
