// SPDX-License-Identifier: AGPL-3.0-only
import { z } from 'zod'

import { chatMessagePartsSchema, SOURCE_KINDS } from './parts.js'
import { searchQuery } from '../core/filters.js'
import { pageQuery, sortQuery } from '../core/pagination.js'
import { orgParamsSchema } from '../core/params.js'
import { modelUsageDtoSchema } from '../models/gateway.js'
import { modelKeySchema } from '../models/keys.js'

// Chats, folders, messages, feedback and attachments (database/chat.md §1–7; Chat). Routes, all
// under /api/v1/orgs/:orgId and all scoped to the signed-in person's own chats (`chat:use`):
// GET /chats · GET/PATCH/DELETE /chats/:chatId · POST /chats/:chatId/restore ·
// GET /chats/:chatId/messages · POST /chats/:chatId/messages (stream: see stream.ts) ·
// GET /chats/:chatId/messages/:messageId/sources/:index ·
// PUT/DELETE /chats/:chatId/messages/:messageId/feedback ·
// POST /chats/:chatId/attachments · POST …/attachments/:attachmentId/{complete,retry} ·
// DELETE …/attachments/:attachmentId ·
// GET/POST /chat-folders · PATCH/DELETE /chat-folders/:folderId · PUT /chat-folders/order.
// Exports use the `chat_pdf`, `chat_markdown` and `chat_json` kinds of `exports` (dataControl).
// Shares, compare variants, prompts and agents' chats arrive with V1 and extend these DTOs.

export const DATA_LOCATIONS = ['local', 'provider', 'platform'] as const
export type DataLocation = (typeof DATA_LOCATIONS)[number]

/** Days a deleted chat stays restorable from Recently deleted. */
export const CHAT_RESTORE_WINDOW_DAYS = 30

export const chatTitleSchema = z.string().trim().min(1).max(200)
export const chatFolderNameSchema = z.string().trim().min(1).max(100)

export const chatParamsSchema = orgParamsSchema.extend({ chatId: z.uuid() })
export type ChatParams = z.infer<typeof chatParamsSchema>

export const chatMessageParamsSchema = chatParamsSchema.extend({ messageId: z.uuid() })
export type ChatMessageParams = z.infer<typeof chatMessageParamsSchema>

// ── Folders ─────────────────────────────────────────────────────────────────────────────────────

export const chatFolderDtoSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  sortOrder: z.number().int().nonnegative(),
  /** Chats in the folder (not deleted). */
  chatCount: z.number().int().nonnegative(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
})
export type ChatFolderDto = z.infer<typeof chatFolderDtoSchema>

export const chatFolderParamsSchema = orgParamsSchema.extend({ folderId: z.uuid() })
export type ChatFolderParams = z.infer<typeof chatFolderParamsSchema>

export const CHAT_FOLDERS_MAX = 100

export const createChatFolderInputSchema = z.object({ name: chatFolderNameSchema })
export type CreateChatFolderInput = z.infer<typeof createChatFolderInputSchema>

export const updateChatFolderInputSchema = z.object({ name: chatFolderNameSchema })
export type UpdateChatFolderInput = z.infer<typeof updateChatFolderInputSchema>

/** `PUT …/chat-folders/order`: every folder id once, in the new order. */
export const reorderChatFoldersInputSchema = z.object({
  folderIds: z.array(z.uuid()).max(CHAT_FOLDERS_MAX),
})
export type ReorderChatFoldersInput = z.infer<typeof reorderChatFoldersInputSchema>

// ── Chats ───────────────────────────────────────────────────────────────────────────────────────

/** Which knowledge bases a chat searches: all it may read, a selection, or none. */
export const CHAT_KNOWLEDGE_SCOPES = ['all', 'selected', 'none'] as const
export type ChatKnowledgeScope = (typeof CHAT_KNOWLEDGE_SCOPES)[number]

export const CHAT_KNOWLEDGE_BASES_MAX = 100

export const chatDtoSchema = z.object({
  id: z.uuid(),
  /** Empty until the first answer generates one. */
  title: z.string(),
  /** True while the title is model-generated; a manual rename sets it to false and stops regeneration. */
  titleGenerated: z.boolean(),
  folderId: z.uuid().nullable(),
  isPinned: z.boolean(),
  pinnedAt: z.iso.datetime().nullable(),
  /** Local models only; excluded from Train and sharing. */
  isPrivate: z.boolean(),
  /** A shared agent the chat talks to (V1); null for a plain model chat. */
  agentId: z.uuid().nullable(),
  knowledgeScope: z.enum(CHAT_KNOWLEDGE_SCOPES),
  /** The selection when `knowledgeScope` is `selected`; empty otherwise. */
  knowledgeBaseIds: z.array(z.uuid()),
  /** The model picked for the next message; `auto` with routing (V2). */
  currentModelKey: modelKeySchema.nullable(),
  lastMessageAt: z.iso.datetime().nullable(),
  messageCount: z.number().int().nonnegative(),
  /** Set only with a search query: the message text that matched, when the title did not. */
  matchedText: z.string().nullable(),
  /** Set while the chat waits in Recently deleted. */
  deletedAt: z.iso.datetime().nullable(),
  /** When the chat is removed for good (`deletedAt` + the restore window); the list shows "{n} days left". */
  purgeAt: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
})
export type ChatDto = z.infer<typeof chatDtoSchema>

export const CHAT_LIST_STATES = ['active', 'deleted'] as const
export type ChatListState = (typeof CHAT_LIST_STATES)[number]

export const CHAT_SORT_FIELDS = ['lastMessageAt', 'pinnedAt', 'deletedAt'] as const

/**
 * `GET …/chats`: the person's own chats, newest message first by default. `q` searches titles and
 * message text; `folderId` is a folder or `none` for chats outside every folder; `state=deleted`
 * is Recently deleted.
 */
export const listChatsQuerySchema = pageQuery.extend({
  q: searchQuery,
  folderId: z.union([z.uuid(), z.literal('none')]).optional(),
  isPinned: z.stringbool().optional(),
  state: z.enum(CHAT_LIST_STATES).default('active'),
  sort: sortQuery(CHAT_SORT_FIELDS),
})
export type ListChatsQuery = z.infer<typeof listChatsQuerySchema>

/**
 * What a chat is created with, and what `PATCH` can change besides the title and pin. Turning
 * `isPrivate` on needs an enabled local model, removes the chat's shares and marks its feedback not
 * eligible for Train. `knowledgeBaseIds` is read only with `knowledgeScope: 'selected'`.
 */
export const chatSettingsInputSchema = z.object({
  folderId: z.uuid().nullable().optional(),
  isPrivate: z.boolean().optional(),
  knowledgeScope: z.enum(CHAT_KNOWLEDGE_SCOPES).optional(),
  knowledgeBaseIds: z.array(z.uuid()).max(CHAT_KNOWLEDGE_BASES_MAX).optional(),
})
export type ChatSettingsInput = z.infer<typeof chatSettingsInputSchema>

/** `PATCH …/chats/:chatId`: rename, pin, move, privacy, knowledge scope, next model. */
export const updateChatInputSchema = chatSettingsInputSchema.extend({
  title: chatTitleSchema.optional(),
  isPinned: z.boolean().optional(),
  currentModelKey: modelKeySchema.optional(),
})
export type UpdateChatInput = z.infer<typeof updateChatInputSchema>

// ── Messages ────────────────────────────────────────────────────────────────────────────────────

export const CHAT_MESSAGE_ROLES = ['user', 'assistant'] as const
export type ChatMessageRole = (typeof CHAT_MESSAGE_ROLES)[number]

/**
 * User messages: `complete`, then `superseded` when edited. Assistant messages: `streaming` →
 * `complete | stopped | interrupted | failed`, any of them → `superseded` on regenerate, edit or
 * "Continue with A/B". Superseded messages are never returned.
 */
export const CHAT_MESSAGE_STATUSES = [
  'streaming',
  'complete',
  'stopped',
  'interrupted',
  'failed',
  'superseded',
] as const
export type ChatMessageStatus = (typeof CHAT_MESSAGE_STATUSES)[number]

/** What an answer cost: the metered call plus reasoning tokens (a display copy; `usage_events` is the record). */
export const chatUsageSchema = modelUsageDtoSchema.extend({
  reasoningTokens: z.number().int().nonnegative(),
})
export type ChatUsage = z.infer<typeof chatUsageSchema>

export const CHAT_FEEDBACK_RATINGS = ['helpful', 'not_helpful'] as const
export type ChatFeedbackRating = (typeof CHAT_FEEDBACK_RATINGS)[number]

export const CHAT_CORRECTION_MAX_LENGTH = 5000

/** The signed-in person's rating of an answer; the correction is user content and never logged. */
export const chatFeedbackDtoSchema = z.object({
  rating: z.enum(CHAT_FEEDBACK_RATINGS),
  correctionText: z.string().nullable(),
  updatedAt: z.iso.datetime(),
})
export type ChatFeedbackDto = z.infer<typeof chatFeedbackDtoSchema>

export const chatMessageDtoSchema = z.object({
  id: z.uuid(),
  chatId: z.uuid(),
  role: z.enum(CHAT_MESSAGE_ROLES),
  status: z.enum(CHAT_MESSAGE_STATUSES),
  parts: chatMessagePartsSchema,
  authorUserId: z.uuid().nullable(),
  /** The model that answered (after routing); assistant messages. */
  modelKey: modelKeySchema.nullable(),
  /** Drives "Stays on your server" / "Sent to {provider}". */
  dataLocation: z.enum(DATA_LOCATIONS).nullable(),
  /** "Personal data hidden before sending". */
  piiMasked: z.boolean(),
  /** Picked by "Auto" (V2). */
  routed: z.boolean(),
  /** Set on `failed` and `interrupted` messages; an API error code. */
  errorCode: z.string().nullable(),
  /** Null while streaming and for answers that failed before anything was sent. */
  usage: chatUsageSchema.nullable(),
  /** The signed-in person's rating; null when unrated. */
  feedback: chatFeedbackDtoSchema.nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
})
export type ChatMessageDto = z.infer<typeof chatMessageDtoSchema>

export const CHAT_MESSAGE_SORT_FIELDS = ['createdAt'] as const

/** `GET …/chats/:chatId/messages`: oldest first by default; `-createdAt` pages backwards from the latest. */
export const listChatMessagesQuerySchema = pageQuery.extend({
  sort: sortQuery(CHAT_MESSAGE_SORT_FIELDS),
})
export type ListChatMessagesQuery = z.infer<typeof listChatMessagesQuerySchema>

/** `PUT …/messages/:messageId/feedback`: rating again replaces it; `DELETE` clears the rating. */
export const setChatFeedbackInputSchema = z.object({
  rating: z.enum(CHAT_FEEDBACK_RATINGS),
  correctionText: z.string().trim().min(1).max(CHAT_CORRECTION_MAX_LENGTH).optional(),
})
export type SetChatFeedbackInput = z.infer<typeof setChatFeedbackInputSchema>

// ── Source preview ──────────────────────────────────────────────────────────────────────────────

export const CHAT_SOURCE_STATUSES = ['available', 'removed', 'no_access'] as const
export type ChatSourceStatus = (typeof CHAT_SOURCE_STATUSES)[number]

export const chatSourceParamsSchema = chatMessageParamsSchema.extend({
  index: z.coerce.number().int().min(1),
})
export type ChatSourceParams = z.infer<typeof chatSourceParamsSchema>

/**
 * `GET …/messages/:messageId/sources/:index`: the side sheet opened from a citation. Opening it
 * re-checks that the viewer may still read the source: `removed` says the source was purged,
 * `no_access` that the person lost access; both keep the title from the message.
 */
export const chatSourcePreviewDtoSchema = z.object({
  index: z.number().int().min(1),
  kind: z.enum(SOURCE_KINDS),
  status: z.enum(CHAT_SOURCE_STATUSES),
  title: z.string(),
  /** The cited passage; null unless `available`. */
  passage: z.string().nullable(),
  page: z.number().int().min(1).nullable(),
  url: z.string().nullable(),
  knowledgeBaseId: z.uuid().nullable(),
  documentId: z.uuid().nullable(),
  chunkId: z.uuid().nullable(),
  /** "Open in Knowledge" is shown only when the viewer may open the document there. */
  canOpenInKnowledge: z.boolean(),
})
export type ChatSourcePreviewDto = z.infer<typeof chatSourcePreviewDtoSchema>

// ── Attachments ─────────────────────────────────────────────────────────────────────────────────

export const CHAT_ATTACHMENT_KINDS = ['image', 'document'] as const
export type ChatAttachmentKind = (typeof CHAT_ATTACHMENT_KINDS)[number]

/** `uploading → processing → ready`; `uploading|processing → failed`; `failed → uploading` (Retry). Images skip `processing`. */
export const CHAT_ATTACHMENT_STATUSES = ['uploading', 'processing', 'ready', 'failed'] as const
export type ChatAttachmentStatus = (typeof CHAT_ATTACHMENT_STATUSES)[number]

const MIB = 1024 * 1024

/** The limits the composer states up front and the API enforces; the server verifies the type from the bytes. */
export const CHAT_ATTACHMENT_LIMITS = {
  maxImageBytes: 10 * MIB,
  maxDocumentBytes: 25 * MIB,
  /** Text kept from a document for the model; longer text is cut. */
  extractedTextMaxChars: 200_000,
} as const

export const CHAT_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'] as const
export const CHAT_DOCUMENT_TYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
  'text/markdown',
  'text/csv',
] as const
export const CHAT_ATTACHMENT_TYPES = [...CHAT_IMAGE_TYPES, ...CHAT_DOCUMENT_TYPES] as const

/** Why an attachment failed; shown as the per-file error under the composer. */
export const CHAT_ATTACHMENT_ERROR_CODES = [
  'CHAT_ATTACHMENT_TOO_LARGE',
  'CHAT_ATTACHMENT_UNSUPPORTED',
  'CHAT_ATTACHMENT_UPLOAD_FAILED',
] as const

export const chatAttachmentDtoSchema = z.object({
  id: z.uuid(),
  chatId: z.uuid(),
  /** Set when the message is sent. */
  messageId: z.uuid().nullable(),
  fileName: z.string(),
  contentType: z.string(),
  sizeBytes: z.number().int().nonnegative(),
  kind: z.enum(CHAT_ATTACHMENT_KINDS),
  status: z.enum(CHAT_ATTACHMENT_STATUSES),
  errorCode: z.enum(CHAT_ATTACHMENT_ERROR_CODES).nullable(),
  /** Documents, once processed. */
  pageCount: z.number().int().positive().nullable(),
  createdAt: z.iso.datetime(),
})
export type ChatAttachmentDto = z.infer<typeof chatAttachmentDtoSchema>

export const chatAttachmentParamsSchema = chatParamsSchema.extend({ attachmentId: z.uuid() })
export type ChatAttachmentParams = z.infer<typeof chatAttachmentParamsSchema>

/** `POST …/chats/:chatId/attachments`: the type and size are checked before a row or an upload URL exists. */
export const requestChatAttachmentUploadInputSchema = z.object({
  fileName: z.string().trim().min(1).max(255),
  contentType: z.enum(CHAT_ATTACHMENT_TYPES),
  sizeBytes: z.number().int().positive().max(CHAT_ATTACHMENT_LIMITS.maxDocumentBytes),
})
export type RequestChatAttachmentUploadInput = z.infer<
  typeof requestChatAttachmentUploadInputSchema
>

/** The short-lived signed upload; the bytes go straight to object storage, then `…/complete` is called. */
export const chatAttachmentUploadDtoSchema = z.object({
  attachment: chatAttachmentDtoSchema,
  upload: z.object({
    url: z.url(),
    method: z.literal('PUT'),
    headers: z.record(z.string(), z.string()),
    expiresAt: z.iso.datetime(),
  }),
})
export type ChatAttachmentUploadDto = z.infer<typeof chatAttachmentUploadDtoSchema>
