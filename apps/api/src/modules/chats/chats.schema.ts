// SPDX-License-Identifier: AGPL-3.0-only
import { z } from 'zod'

import {
  chatAttachmentDtoSchema,
  chatAttachmentParamsSchema,
  chatAttachmentUploadDtoSchema,
  chatDtoSchema,
  chatFeedbackDtoSchema,
  chatFolderDtoSchema,
  chatFolderParamsSchema,
  chatMessageDtoSchema,
  chatMessageParamsSchema,
  chatParamsSchema,
  chatSourceParamsSchema,
  chatSourcePreviewDtoSchema,
  createChatFolderInputSchema,
  listChatMessagesQuerySchema,
  listChatsQuerySchema,
  okResponse,
  orgParamsSchema,
  pageResponse,
  reorderChatFoldersInputSchema,
  requestChatAttachmentUploadInputSchema,
  sendChatMessageInputSchema,
  setChatFeedbackInputSchema,
  updateChatFolderInputSchema,
  updateChatInputSchema,
} from '@surefy/contracts'

const CHATS = ['chats']
const FOLDERS = ['chat-folders']

// ── Chats ─────────────────────────────────────────────────────────────────────────────────────

export const listChatsRoute = {
  tags: CHATS,
  summary: "The signed-in person's chats, or their Recently deleted",
  params: orgParamsSchema,
  querystring: listChatsQuerySchema,
  response: { 200: pageResponse(chatDtoSchema) },
}

export const getChatRoute = {
  tags: CHATS,
  summary: 'One of the signed-in person’s chats',
  params: chatParamsSchema,
  response: { 200: okResponse(chatDtoSchema) },
}

export const updateChatRoute = {
  tags: CHATS,
  summary: 'Rename, pin, move, set privacy, knowledge scope and the next model',
  params: chatParamsSchema,
  body: updateChatInputSchema,
  response: { 200: okResponse(chatDtoSchema) },
}

export const deleteChatRoute = {
  tags: CHATS,
  summary: 'Moves the chat to Recently deleted (restorable for 30 days)',
  params: chatParamsSchema,
}

export const restoreChatRoute = {
  tags: CHATS,
  summary: 'Restores a chat from Recently deleted',
  params: chatParamsSchema,
  response: { 200: okResponse(chatDtoSchema) },
}

// ── Messages ──────────────────────────────────────────────────────────────────────────────────

export const listChatMessagesRoute = {
  tags: CHATS,
  summary: 'The thread: messages that were not superseded',
  params: chatParamsSchema,
  querystring: listChatMessagesQuerySchema,
  response: { 200: pageResponse(chatMessageDtoSchema) },
}

/** Streams the answer as the AI SDK UI message stream (`text/event-stream`); see contracts `stream.ts`. */
export const sendChatMessageRoute = {
  tags: CHATS,
  summary: 'Sends a message, regenerates, edits or continues, and streams the answer',
  params: chatParamsSchema,
  body: sendChatMessageInputSchema,
}

export const getChatSourceRoute = {
  tags: CHATS,
  summary: 'The cited source of an answer, checked again for the viewer',
  params: chatSourceParamsSchema,
  response: { 200: okResponse(chatSourcePreviewDtoSchema) },
}

export const setChatFeedbackRoute = {
  tags: CHATS,
  summary: 'Rates an answer',
  params: chatMessageParamsSchema,
  body: setChatFeedbackInputSchema,
  response: { 200: okResponse(chatFeedbackDtoSchema) },
}

export const clearChatFeedbackRoute = {
  tags: CHATS,
  summary: 'Clears the rating of an answer',
  params: chatMessageParamsSchema,
}

// ── Attachments ───────────────────────────────────────────────────────────────────────────────

export const requestChatAttachmentRoute = {
  tags: CHATS,
  summary: 'Checks the file and returns a signed upload URL',
  params: chatParamsSchema,
  body: requestChatAttachmentUploadInputSchema,
  response: { 201: okResponse(chatAttachmentUploadDtoSchema) },
}

export const completeChatAttachmentRoute = {
  tags: CHATS,
  summary: 'Verifies the uploaded bytes; documents are then read for the model',
  params: chatAttachmentParamsSchema,
  response: { 200: okResponse(chatAttachmentDtoSchema) },
}

export const retryChatAttachmentRoute = {
  tags: CHATS,
  summary: 'A new signed upload URL for a failed attachment',
  params: chatAttachmentParamsSchema,
  response: { 200: okResponse(chatAttachmentUploadDtoSchema) },
}

export const deleteChatAttachmentRoute = {
  tags: CHATS,
  summary: 'Removes an attachment that was not sent',
  params: chatAttachmentParamsSchema,
}

/** The signed `PUT` of the bytes; no session, the signature is the credential. */
export const chatUploadParamsSchema = z.object({ attachmentId: z.uuid() })
export const chatUploadQuerySchema = z.object({
  org: z.uuid(),
  expires: z.coerce.number().int().positive(),
  signature: z.string().regex(/^[0-9a-f]{64}$/),
})
export const putChatUploadRoute = {
  tags: CHATS,
  summary: 'Receives the bytes of an attachment at its signed URL',
  params: chatUploadParamsSchema,
  querystring: chatUploadQuerySchema,
}

// ── Folders ───────────────────────────────────────────────────────────────────────────────────

export const listChatFoldersRoute = {
  tags: FOLDERS,
  summary: "The signed-in person's folders",
  params: orgParamsSchema,
  response: { 200: pageResponse(chatFolderDtoSchema) },
}

export const createChatFolderRoute = {
  tags: FOLDERS,
  summary: 'Creates a folder',
  params: orgParamsSchema,
  body: createChatFolderInputSchema,
  response: { 201: okResponse(chatFolderDtoSchema) },
}

export const updateChatFolderRoute = {
  tags: FOLDERS,
  summary: 'Renames a folder',
  params: chatFolderParamsSchema,
  body: updateChatFolderInputSchema,
  response: { 200: okResponse(chatFolderDtoSchema) },
}

export const deleteChatFolderRoute = {
  tags: FOLDERS,
  summary: 'Deletes a folder; its chats return to the list',
  params: chatFolderParamsSchema,
}

export const reorderChatFoldersRoute = {
  tags: FOLDERS,
  summary: 'Sets the order of the folders',
  params: orgParamsSchema,
  body: reorderChatFoldersInputSchema,
  response: { 200: pageResponse(chatFolderDtoSchema) },
}
