// SPDX-License-Identifier: AGPL-3.0-only
import { z } from 'zod'

import { chatSettingsInputSchema, chatUsageSchema, DATA_LOCATIONS } from './schemas.js'
import { modelFallbackDtoSchema, modelRefDtoSchema } from '../models/gateway.js'
import { modelKeySchema } from '../models/keys.js'

// The streaming protocol (backend/api.md §8, frontend/services-api.md §7).
//
// `POST /api/v1/orgs/:orgId/chats/:chatId/messages` answers `200 text/event-stream` in the AI SDK
// UI message stream format, consumed with `useChat`. The stream carries the SDK's own chunks (text,
// reasoning, tool calls and results, `source-url`, `finish`) plus the SurefyOS data chunks below,
// sent as `data-<name>` chunks with the schema named here. Rules:
// - Errors before the first byte use the normal error envelope. After streaming started, an `error`
//   chunk is sent whose `errorText` is an API error code (`ERROR_CODES`), for example
//   `MODEL_PROVIDER_UNAVAILABLE`, `BUDGET_EXCEEDED`, `CREDITS_EXHAUSTED` or `RATE_LIMITED`.
// - The client stops an answer by aborting the request; the server keeps the partial output and
//   marks the message `stopped`. "Continue" is a new request (trigger `continue`).
// - The first `start` chunk's `messageId` is the assistant message's id.
// - `:chatId` may be a new id the client generated: the chat is inserted with its first message or
//   first attachment, so empty chats are never stored.

const messageTextSchema = z.string().trim().min(1).max(100_000)

/** Most files one message carries. */
export const CHAT_MESSAGE_ATTACHMENTS_MAX = 10

const attachmentIdsSchema = z.array(z.uuid()).max(CHAT_MESSAGE_ATTACHMENTS_MAX)

const submitMessageInputSchema = z.object({
  trigger: z.literal('submit'),
  text: messageTextSchema,
  attachmentIds: attachmentIdsSchema.default([]),
  /** The model for this answer; omitted keeps the chat's current model. A change adds a switch divider. */
  modelKey: modelKeySchema.optional(),
  /** Used only when this request creates the chat; ignored otherwise. */
  newChat: chatSettingsInputSchema.optional(),
})

const regenerateMessageInputSchema = z.object({
  trigger: z.literal('regenerate'),
  /** The assistant message to replace; it becomes `superseded`. */
  messageId: z.uuid(),
  modelKey: modelKeySchema.optional(),
})

const editMessageInputSchema = z.object({
  trigger: z.literal('edit'),
  /** The user message being edited; it and every later message become `superseded`. */
  messageId: z.uuid(),
  text: messageTextSchema,
  attachmentIds: attachmentIdsSchema.default([]),
  modelKey: modelKeySchema.optional(),
})

const continueMessageInputSchema = z.object({
  trigger: z.literal('continue'),
  /** The `stopped` assistant message to continue with a further assistant message. */
  messageId: z.uuid(),
})

/** Body of `POST …/chats/:chatId/messages`: the AI SDK transport sends it from `prepareSendMessagesRequest`. */
export const sendChatMessageInputSchema = z.discriminatedUnion('trigger', [
  submitMessageInputSchema,
  regenerateMessageInputSchema,
  editMessageInputSchema,
  continueMessageInputSchema,
])
export type SendChatMessageInput = z.infer<typeof sendChatMessageInputSchema>

export const CHAT_DATA_PART_DATA_TYPES = {
  /** Sent first: the ids the server assigned. */
  message: 'data-message',
  /** Sent after the model is resolved: which model answers, where the data goes, any fallback. */
  model: 'data-model',
  /** Sent last, before `finish`: what the call cost. */
  usage: 'data-usage',
  /** Sent once when the first answer generated a title. */
  title: 'data-title',
} as const

export const chatMessageIdsDataSchema = z.object({
  /** Null for `regenerate` and `continue`, which add no user message. */
  userMessageId: z.uuid().nullable(),
  assistantMessageId: z.uuid(),
})
export type ChatMessageIdsData = z.infer<typeof chatMessageIdsDataSchema>

export const chatModelDataSchema = z.object({
  model: modelRefDtoSchema,
  /** "Stays on your server" / "Sent to {provider}". */
  dataLocation: z.enum(DATA_LOCATIONS),
  /** "Personal data hidden before sending". */
  piiMasked: z.boolean(),
  /** The model was chosen by "Auto" (V2). */
  routed: z.boolean(),
  /** Set when the fallback order replaced the requested model. */
  fallback: modelFallbackDtoSchema.nullable(),
})
export type ChatModelData = z.infer<typeof chatModelDataSchema>

export const chatTitleDataSchema = z.object({ title: z.string() })

/** One schema per SurefyOS data chunk, keyed by its name (`data-<name>` on the wire). */
export const chatStreamDataSchemas = {
  message: chatMessageIdsDataSchema,
  model: chatModelDataSchema,
  usage: chatUsageSchema,
  title: chatTitleDataSchema,
} as const
