// SPDX-License-Identifier: AGPL-3.0-only
import type { ChatAttachmentsService } from './chatAttachments.service.js'
import type { ChatMessagesService } from './chatMessages.service.js'
import type {
  clearChatFeedbackRoute,
  completeChatAttachmentRoute,
  createChatFolderRoute,
  deleteChatAttachmentRoute,
  deleteChatFolderRoute,
  deleteChatRoute,
  getChatRoute,
  getChatSourceRoute,
  listChatFoldersRoute,
  listChatMessagesRoute,
  listChatsRoute,
  putChatUploadRoute,
  reorderChatFoldersRoute,
  requestChatAttachmentRoute,
  restoreChatRoute,
  retryChatAttachmentRoute,
  sendChatMessageRoute,
  setChatFeedbackRoute,
  updateChatFolderRoute,
  updateChatRoute,
} from './chats.schema.js'
import type { ChatsService } from './chats.service.js'
import type { ChatStreamService } from './chatStream.service.js'
import type { ZodReply, ZodRequest } from '@/types/fastify.js'
import type { FastifySchema } from 'fastify'

type R<S extends FastifySchema> = ZodRequest<S>
type P<S extends FastifySchema> = ZodReply<S>

export interface ChatsControllerDeps {
  chats: ChatsService
  messages: ChatMessagesService
  stream: ChatStreamService
  attachments: ChatAttachmentsService
}

export class ChatsController {
  constructor(private readonly deps: ChatsControllerDeps) {}

  // ── Chats ───────────────────────────────────────────────────────────────────────────────────

  list = async (request: R<typeof listChatsRoute>, reply: P<typeof listChatsRoute>) => {
    const { items, nextCursor } = await this.deps.chats.list(request.tenant, request.query)
    reply.page(items, nextCursor)
  }

  get = async (request: R<typeof getChatRoute>, reply: P<typeof getChatRoute>) => {
    reply.ok(await this.deps.chats.get(request.tenant, request.params.chatId))
  }

  update = async (request: R<typeof updateChatRoute>, reply: P<typeof updateChatRoute>) => {
    reply.ok(await this.deps.chats.update(request.tenant, request.params.chatId, request.body))
  }

  delete = async (request: R<typeof deleteChatRoute>, reply: P<typeof deleteChatRoute>) => {
    await this.deps.chats.delete(request.tenant, request.params.chatId)
    reply.noContent()
  }

  restore = async (request: R<typeof restoreChatRoute>, reply: P<typeof restoreChatRoute>) => {
    reply.ok(await this.deps.chats.restore(request.tenant, request.params.chatId))
  }

  // ── Messages ────────────────────────────────────────────────────────────────────────────────

  listMessages = async (
    request: R<typeof listChatMessagesRoute>,
    reply: P<typeof listChatMessagesRoute>,
  ) => {
    const { items, nextCursor } = await this.deps.messages.list(
      request.tenant,
      request.params.chatId,
      request.query,
    )
    reply.page(items, nextCursor)
  }

  /** The one handler that streams: a client that goes away aborts the model call. */
  send = async (request: R<typeof sendChatMessageRoute>, reply: P<typeof sendChatMessageRoute>) => {
    const abort = new AbortController()
    // the response closing before it finished: stop the model call (the request's own `close`
    // fires as soon as its body is read, which would cancel every call)
    reply.raw.on('close', () => {
      if (!reply.raw.writableFinished) abort.abort()
    })
    const stream = await this.deps.stream.send(
      request.tenant,
      request.params.chatId,
      request.body,
      abort.signal,
    )
    return reply.uiMessageStream(stream)
  }

  sourcePreview = async (
    request: R<typeof getChatSourceRoute>,
    reply: P<typeof getChatSourceRoute>,
  ) => {
    const { chatId, messageId, index } = request.params
    reply.ok(await this.deps.messages.sourcePreview(request.tenant, chatId, messageId, index))
  }

  setFeedback = async (
    request: R<typeof setChatFeedbackRoute>,
    reply: P<typeof setChatFeedbackRoute>,
  ) => {
    const { chatId, messageId } = request.params
    reply.ok(await this.deps.messages.setFeedback(request.tenant, chatId, messageId, request.body))
  }

  clearFeedback = async (
    request: R<typeof clearChatFeedbackRoute>,
    reply: P<typeof clearChatFeedbackRoute>,
  ) => {
    const { chatId, messageId } = request.params
    await this.deps.messages.clearFeedback(request.tenant, chatId, messageId)
    reply.noContent()
  }

  // ── Attachments ─────────────────────────────────────────────────────────────────────────────

  requestAttachment = async (
    request: R<typeof requestChatAttachmentRoute>,
    reply: P<typeof requestChatAttachmentRoute>,
  ) => {
    reply.created(
      await this.deps.attachments.requestUpload(
        request.tenant,
        request.params.chatId,
        request.body,
        `${request.protocol}://${request.host}`,
      ),
    )
  }

  completeAttachment = async (
    request: R<typeof completeChatAttachmentRoute>,
    reply: P<typeof completeChatAttachmentRoute>,
  ) => {
    const { chatId, attachmentId } = request.params
    reply.ok(await this.deps.attachments.complete(request.tenant, chatId, attachmentId))
  }

  retryAttachment = async (
    request: R<typeof retryChatAttachmentRoute>,
    reply: P<typeof retryChatAttachmentRoute>,
  ) => {
    const { chatId, attachmentId } = request.params
    reply.ok(
      await this.deps.attachments.retry(
        request.tenant,
        chatId,
        attachmentId,
        `${request.protocol}://${request.host}`,
      ),
    )
  }

  deleteAttachment = async (
    request: R<typeof deleteChatAttachmentRoute>,
    reply: P<typeof deleteChatAttachmentRoute>,
  ) => {
    const { chatId, attachmentId } = request.params
    await this.deps.attachments.remove(request.tenant, chatId, attachmentId)
    reply.noContent()
  }

  /** The signed upload: the body is the file's bytes (a buffer, see the route's content type parser). */
  putUpload = async (
    request: R<typeof putChatUploadRoute>,
    reply: P<typeof putChatUploadRoute>,
  ) => {
    const { org, expires, signature } = request.query
    await this.deps.attachments.receive(
      request.params.attachmentId,
      { org, expires, signature },
      Buffer.isBuffer(request.body) ? request.body : Buffer.alloc(0),
    )
    reply.noContent()
  }

  // ── Folders ─────────────────────────────────────────────────────────────────────────────────

  listFolders = async (
    request: R<typeof listChatFoldersRoute>,
    reply: P<typeof listChatFoldersRoute>,
  ) => {
    const { items, nextCursor } = await this.deps.chats.listFolders(request.tenant)
    reply.page(items, nextCursor)
  }

  createFolder = async (
    request: R<typeof createChatFolderRoute>,
    reply: P<typeof createChatFolderRoute>,
  ) => {
    reply.created(await this.deps.chats.createFolder(request.tenant, request.body))
  }

  updateFolder = async (
    request: R<typeof updateChatFolderRoute>,
    reply: P<typeof updateChatFolderRoute>,
  ) => {
    reply.ok(
      await this.deps.chats.renameFolder(request.tenant, request.params.folderId, request.body),
    )
  }

  deleteFolder = async (
    request: R<typeof deleteChatFolderRoute>,
    reply: P<typeof deleteChatFolderRoute>,
  ) => {
    await this.deps.chats.deleteFolder(request.tenant, request.params.folderId)
    reply.noContent()
  }

  reorderFolders = async (
    request: R<typeof reorderChatFoldersRoute>,
    reply: P<typeof reorderChatFoldersRoute>,
  ) => {
    const { items, nextCursor } = await this.deps.chats.reorderFolders(request.tenant, request.body)
    reply.page(items, nextCursor)
  }
}
