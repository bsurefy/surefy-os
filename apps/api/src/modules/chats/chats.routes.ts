// SPDX-License-Identifier: AGPL-3.0-only
import { RATE_LIMITS } from '@/constants/rateLimits.js'
import { CHAT_ATTACHMENT_LIMITS, PERMISSIONS } from '@surefy/contracts'

import {
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

import type { ChatsController } from './chats.controller.js'
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'

/** Every route is the signed-in person's own (`chat:use`); one exception, the signed upload. */
export function chatsRoutes(controller: ChatsController): FastifyPluginAsyncZod {
  return async (app) => {
    const use = app.authorize(PERMISSIONS.CHAT_USE)
    const chats = '/orgs/:orgId/chats'
    const chat = `${chats}/:chatId`
    const folders = '/orgs/:orgId/chat-folders'

    app.get(chats, { schema: listChatsRoute, preHandler: use }, controller.list)
    app.get(chat, { schema: getChatRoute, preHandler: use }, controller.get)
    app.patch(chat, { schema: updateChatRoute, preHandler: use }, controller.update)
    app.delete(chat, { schema: deleteChatRoute, preHandler: use }, controller.delete)
    app.post(`${chat}/restore`, { schema: restoreChatRoute, preHandler: use }, controller.restore)

    app.get(
      `${chat}/messages`,
      { schema: listChatMessagesRoute, preHandler: use },
      controller.listMessages,
    )
    app.post(`${chat}/messages`, { schema: sendChatMessageRoute, preHandler: use }, controller.send)
    app.get(
      `${chat}/messages/:messageId/sources/:index`,
      { schema: getChatSourceRoute, preHandler: use },
      controller.sourcePreview,
    )
    app.put(
      `${chat}/messages/:messageId/feedback`,
      { schema: setChatFeedbackRoute, preHandler: use },
      controller.setFeedback,
    )
    app.delete(
      `${chat}/messages/:messageId/feedback`,
      { schema: clearChatFeedbackRoute, preHandler: use },
      controller.clearFeedback,
    )

    app.post(
      `${chat}/attachments`,
      { schema: requestChatAttachmentRoute, preHandler: use },
      controller.requestAttachment,
    )
    app.post(
      `${chat}/attachments/:attachmentId/complete`,
      { schema: completeChatAttachmentRoute, preHandler: use },
      controller.completeAttachment,
    )
    app.post(
      `${chat}/attachments/:attachmentId/retry`,
      { schema: retryChatAttachmentRoute, preHandler: use },
      controller.retryAttachment,
    )
    app.delete(
      `${chat}/attachments/:attachmentId`,
      { schema: deleteChatAttachmentRoute, preHandler: use },
      controller.deleteAttachment,
    )

    app.get(folders, { schema: listChatFoldersRoute, preHandler: use }, controller.listFolders)
    app.post(folders, { schema: createChatFolderRoute, preHandler: use }, controller.createFolder)
    app.put(
      `${folders}/order`,
      { schema: reorderChatFoldersRoute, preHandler: use },
      controller.reorderFolders,
    )
    app.patch(
      `${folders}/:folderId`,
      { schema: updateChatFolderRoute, preHandler: use },
      controller.updateFolder,
    )
    app.delete(
      `${folders}/:folderId`,
      { schema: deleteChatFolderRoute, preHandler: use },
      controller.deleteFolder,
    )

    // The signed upload takes raw bytes, so it gets its own context with a buffer body parser.
    await app.register((upload) => {
      // the built-in text and JSON parsers would decode the file: every type arrives as bytes
      upload.removeAllContentTypeParsers()
      upload.addContentTypeParser(
        '*',
        { parseAs: 'buffer', bodyLimit: CHAT_ATTACHMENT_LIMITS.maxDocumentBytes },
        (_request, body, done) => {
          done(null, body)
        },
      )
      upload.put(
        '/chat-uploads/:attachmentId',
        {
          schema: putChatUploadRoute,
          bodyLimit: CHAT_ATTACHMENT_LIMITS.maxDocumentBytes,
          config: { public: true, rateLimit: RATE_LIMITS.publicLookup },
        },
        controller.putUpload,
      )
      return Promise.resolve()
    })
  }
}
