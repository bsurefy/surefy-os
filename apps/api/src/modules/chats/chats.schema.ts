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
  chatShareParamsSchema,
  chatSharesDtoSchema,
  chatShareTargetDtoSchema,
  chatSourceParamsSchema,
  chatSourcePreviewDtoSchema,
  createChatFolderInputSchema,
  createChatSharesInputSchema,
  createPromptInputSchema,
  listChatMessagesQuerySchema,
  listChatShareTargetsQuerySchema,
  listChatsQuerySchema,
  listPromptsQuerySchema,
  listSharedChatsQuerySchema,
  okResponse,
  orgParamsSchema,
  pageResponse,
  promptDtoSchema,
  promptParamsSchema,
  reorderChatFoldersInputSchema,
  requestChatAttachmentUploadInputSchema,
  sendChatMessageInputSchema,
  setChatFeedbackInputSchema,
  sharedChatDetailDtoSchema,
  sharedChatDtoSchema,
  sharedChatParamsSchema,
  updateChatFolderInputSchema,
  updateChatInputSchema,
  updatePromptInputSchema,
} from '@surefy/contracts'

const CHATS = ['chats']
const FOLDERS = ['chat-folders']
const SHARES = ['chat-shares']
const PROMPTS = ['prompts']

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

/** Compare (V1): "Continue with A/B"; the other answer becomes superseded. */
export const chooseChatMessageRoute = {
  tags: CHATS,
  summary: 'Continues the chat with one answer of a comparison',
  params: chatMessageParamsSchema,
  response: { 200: okResponse(chatMessageDtoSchema) },
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

// ── Shares (V1) ───────────────────────────────────────────────────────────────────────────────

export const listChatSharesRoute = {
  tags: SHARES,
  summary: 'The people and teams a chat is shared with (the owner)',
  params: chatParamsSchema,
  response: { 200: okResponse(chatSharesDtoSchema) },
}

export const createChatSharesRoute = {
  tags: SHARES,
  summary: 'Shares a chat view only with people and teams of the organization',
  params: chatParamsSchema,
  body: createChatSharesInputSchema,
  response: { 200: okResponse(chatSharesDtoSchema) },
}

export const deleteChatShareRoute = {
  tags: SHARES,
  summary: 'Stops sharing a chat with a person or team',
  params: chatShareParamsSchema,
}

export const listSharedChatsRoute = {
  tags: SHARES,
  summary: 'Shared with me: chats others shared with the person or their teams',
  params: orgParamsSchema,
  querystring: listSharedChatsQuerySchema,
  response: { 200: pageResponse(sharedChatDtoSchema) },
}

export const listChatShareTargetsRoute = {
  tags: SHARES,
  summary: 'The people and teams a chat can be shared with',
  params: orgParamsSchema,
  querystring: listChatShareTargetsQuerySchema,
  response: { 200: pageResponse(chatShareTargetDtoSchema) },
}

export const getSharedChatRoute = {
  tags: SHARES,
  summary: 'The view-only header of a chat shared with the person',
  params: sharedChatParamsSchema,
  response: { 200: okResponse(sharedChatDetailDtoSchema) },
}

// ── Prompts (V1) ──────────────────────────────────────────────────────────────────────────────

export const listPromptsRoute = {
  tags: PROMPTS,
  summary: "The person's prompts and the shared prompts they can see, or their Recently deleted",
  params: orgParamsSchema,
  querystring: listPromptsQuerySchema,
  response: { 200: pageResponse(promptDtoSchema) },
}

export const createPromptRoute = {
  tags: PROMPTS,
  summary: 'Creates a personal or shared prompt',
  params: orgParamsSchema,
  body: createPromptInputSchema,
  response: { 201: okResponse(promptDtoSchema) },
}

export const getPromptRoute = {
  tags: PROMPTS,
  summary: 'One prompt the person can see',
  params: promptParamsSchema,
  response: { 200: okResponse(promptDtoSchema) },
}

export const updatePromptRoute = {
  tags: PROMPTS,
  summary: 'Changes a prompt, its visibility or its teams',
  params: promptParamsSchema,
  body: updatePromptInputSchema,
  response: { 200: okResponse(promptDtoSchema) },
}

export const deletePromptRoute = {
  tags: PROMPTS,
  summary: 'Moves the prompt to Recently deleted (restorable for 30 days)',
  params: promptParamsSchema,
}

export const restorePromptRoute = {
  tags: PROMPTS,
  summary: 'Restores a prompt from Recently deleted',
  params: promptParamsSchema,
  response: { 200: okResponse(promptDtoSchema) },
}
