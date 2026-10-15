// SPDX-License-Identifier: AGPL-3.0-only
import type { ChatAttachmentsService } from './chatAttachments.service.js'
import type { ChatMessagesService } from './chatMessages.service.js'
import type {
  chooseChatMessageRoute,
  clearChatFeedbackRoute,
  completeChatAttachmentRoute,
  createChatFolderRoute,
  createChatSharesRoute,
  createPromptRoute,
  deleteChatAttachmentRoute,
  deleteChatFolderRoute,
  deleteChatRoute,
  deleteChatShareRoute,
  deletePromptRoute,
  getChatRoute,
  getChatSourceRoute,
  getPromptRoute,
  getSharedChatRoute,
  listChatShareTargetsRoute,
  listChatFoldersRoute,
  listChatMessagesRoute,
  listChatSharesRoute,
  listChatsRoute,
  listPromptsRoute,
  listSharedChatsRoute,
  putChatUploadRoute,
  reorderChatFoldersRoute,
  requestChatAttachmentRoute,
  restoreChatRoute,
  restorePromptRoute,
  retryChatAttachmentRoute,
  sendChatMessageRoute,
  setChatFeedbackRoute,
  updateChatFolderRoute,
  updateChatRoute,
  updatePromptRoute,
} from './chats.schema.js'
import type { ChatsService } from './chats.service.js'
import type { ChatSharesService } from './chatShares.service.js'
import type { ChatStreamService } from './chatStream.service.js'
import type { PromptsService } from './prompts.service.js'
import type { ZodReply, ZodRequest } from '@/types/fastify.js'
import type { FastifySchema } from 'fastify'

type R<S extends FastifySchema> = ZodRequest<S>
type P<S extends FastifySchema> = ZodReply<S>

export interface ChatsControllerDeps {
  chats: ChatsService
  messages: ChatMessagesService
  stream: ChatStreamService
  attachments: ChatAttachmentsService
  shares: ChatSharesService
  prompts: PromptsService
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

  /** The one handler that streams: a client that goes away aborts the model call (not a run). */
  send = async (request: R<typeof sendChatMessageRoute>, reply: P<typeof sendChatMessageRoute>) => {
    const abort = new AbortController()
    // the response closing before it finished: stop the model call (the request's own `close`
    // fires as soon as its body is read, which would cancel every call)
    reply.raw.on('close', () => {
      if (!reply.raw.writableFinished) abort.abort()
    })
    const sent = await this.deps.stream.send(
      request.tenant,
      request.params.chatId,
      request.body,
      abort.signal,
    )
    // an agent chat answers with its run's event stream; closing it never cancels the run
    if (sent.kind === 'response') return reply.send(sent.response)
    return reply.uiMessageStream(sent.stream)
  }

  /** Compare: "Continue with A/B". */
  choose = async (
    request: R<typeof chooseChatMessageRoute>,
    reply: P<typeof chooseChatMessageRoute>,
  ) => {
    const { chatId, messageId } = request.params
    reply.ok(await this.deps.stream.choose(request.tenant, chatId, messageId))
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

  // ── Shares ──────────────────────────────────────────────────────────────────────────────────

  listShares = async (
    request: R<typeof listChatSharesRoute>,
    reply: P<typeof listChatSharesRoute>,
  ) => {
    reply.ok(await this.deps.shares.list(request.tenant, request.params.chatId))
  }

  createShares = async (
    request: R<typeof createChatSharesRoute>,
    reply: P<typeof createChatSharesRoute>,
  ) => {
    reply.ok(await this.deps.shares.create(request.tenant, request.params.chatId, request.body))
  }

  deleteShare = async (
    request: R<typeof deleteChatShareRoute>,
    reply: P<typeof deleteChatShareRoute>,
  ) => {
    await this.deps.shares.remove(request.tenant, request.params.chatId, request.params.shareId)
    reply.noContent()
  }

  listShared = async (
    request: R<typeof listSharedChatsRoute>,
    reply: P<typeof listSharedChatsRoute>,
  ) => {
    const { items, nextCursor } = await this.deps.shares.listShared(request.tenant, request.query)
    reply.page(items, nextCursor)
  }

  listShareTargets = async (
    request: R<typeof listChatShareTargetsRoute>,
    reply: P<typeof listChatShareTargetsRoute>,
  ) => {
    const { items, nextCursor } = await this.deps.shares.targets(request.tenant, request.query)
    reply.page(items, nextCursor)
  }

  getShared = async (
    request: R<typeof getSharedChatRoute>,
    reply: P<typeof getSharedChatRoute>,
  ) => {
    reply.ok(await this.deps.shares.getShared(request.tenant, request.params.chatId))
  }

  // ── Prompts ─────────────────────────────────────────────────────────────────────────────────

  listPrompts = async (request: R<typeof listPromptsRoute>, reply: P<typeof listPromptsRoute>) => {
    const { items, nextCursor } = await this.deps.prompts.list(request.tenant, request.query)
    reply.page(items, nextCursor)
  }

  createPrompt = async (
    request: R<typeof createPromptRoute>,
    reply: P<typeof createPromptRoute>,
  ) => {
    reply.created(await this.deps.prompts.create(request.tenant, request.body))
  }

  getPrompt = async (request: R<typeof getPromptRoute>, reply: P<typeof getPromptRoute>) => {
    reply.ok(await this.deps.prompts.get(request.tenant, request.params.promptId))
  }

  updatePrompt = async (
    request: R<typeof updatePromptRoute>,
    reply: P<typeof updatePromptRoute>,
  ) => {
    reply.ok(await this.deps.prompts.update(request.tenant, request.params.promptId, request.body))
  }

  deletePrompt = async (
    request: R<typeof deletePromptRoute>,
    reply: P<typeof deletePromptRoute>,
  ) => {
    await this.deps.prompts.delete(request.tenant, request.params.promptId)
    reply.noContent()
  }

  restorePrompt = async (
    request: R<typeof restorePromptRoute>,
    reply: P<typeof restorePromptRoute>,
  ) => {
    reply.ok(await this.deps.prompts.restore(request.tenant, request.params.promptId))
  }
}
