// SPDX-License-Identifier: AGPL-3.0-only
import type {
  ChatAttachmentDto,
  ChatDto,
  ChatFeedbackDto,
  ChatFolderDto,
  ChatMessageDto,
} from '@surefy/contracts'

import { purgeAtOf } from './chats.utils.js'

import type {
  chatAttachments,
  chatFolders,
  chatMessageFeedback,
  chatMessages,
  chats,
} from '@/database/tables/index.js'

export type ChatRow = typeof chats.$inferSelect
export type ChatFolderRow = typeof chatFolders.$inferSelect
export type ChatMessageRow = typeof chatMessages.$inferSelect
export type ChatFeedbackRow = typeof chatMessageFeedback.$inferSelect
export type ChatAttachmentRow = typeof chatAttachments.$inferSelect

const iso = (date: Date): string => date.toISOString()

export function toChatDto(
  row: ChatRow,
  extra: { knowledgeBaseIds?: readonly string[]; matchedText?: string | null } = {},
): ChatDto {
  return {
    id: row.id,
    title: row.title,
    titleGenerated: row.titleGenerated,
    folderId: row.folderId,
    isPinned: row.isPinned,
    pinnedAt: row.pinnedAt === null ? null : iso(row.pinnedAt),
    isPrivate: row.isPrivate,
    agentId: row.agentId,
    knowledgeScope: row.knowledgeScope,
    knowledgeBaseIds: row.knowledgeScope === 'selected' ? [...(extra.knowledgeBaseIds ?? [])] : [],
    currentModelKey: row.currentModelKey,
    lastMessageAt: row.lastMessageAt === null ? null : iso(row.lastMessageAt),
    messageCount: row.messageCount,
    matchedText: extra.matchedText ?? null,
    deletedAt: row.deletedAt === null ? null : iso(row.deletedAt),
    purgeAt: row.deletedAt === null ? null : iso(purgeAtOf(row.deletedAt)),
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
  }
}

export function toFolderDto(row: ChatFolderRow, chatCount: number): ChatFolderDto {
  return {
    id: row.id,
    name: row.name,
    sortOrder: row.sortOrder,
    chatCount,
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
  }
}

export const toFeedbackDto = (row: ChatFeedbackRow): ChatFeedbackDto => ({
  rating: row.rating,
  correctionText: row.correctionText,
  updatedAt: iso(row.updatedAt),
})

export function toMessageDto(
  row: ChatMessageRow,
  feedback: ChatFeedbackRow | null,
): ChatMessageDto {
  const metered = row.inputTokens !== null && row.outputTokens !== null
  return {
    id: row.id,
    chatId: row.chatId,
    role: row.role,
    status: row.status,
    parts: row.parts,
    authorUserId: row.authorUserId,
    modelKey: row.modelKey,
    dataLocation: row.dataLocation,
    piiMasked: row.piiMasked,
    routed: row.routed,
    errorCode: row.errorCode,
    usage: metered
      ? {
          inputTokens: row.inputTokens ?? 0,
          outputTokens: row.outputTokens ?? 0,
          cachedInputTokens: row.cachedInputTokens ?? 0,
          reasoningTokens: row.reasoningTokens ?? 0,
          costMicros: row.costMicros ?? 0,
          currency: row.currency,
          firstTokenMs: row.timeToFirstTokenMs,
          latencyMs: row.latencyMs ?? 0,
        }
      : null,
    feedback: feedback === null ? null : toFeedbackDto(feedback),
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
  }
}

export const toAttachmentDto = (row: ChatAttachmentRow): ChatAttachmentDto => ({
  id: row.id,
  chatId: row.chatId,
  messageId: row.messageId,
  fileName: row.fileName,
  contentType: row.contentType,
  sizeBytes: row.sizeBytes,
  kind: row.kind,
  status: row.status,
  errorCode: toAttachmentErrorCode(row.errorCode),
  pageCount: row.pageCount,
  createdAt: iso(row.createdAt),
})

const ATTACHMENT_ERRORS = [
  'CHAT_ATTACHMENT_TOO_LARGE',
  'CHAT_ATTACHMENT_UNSUPPORTED',
  'CHAT_ATTACHMENT_UPLOAD_FAILED',
] as const

function toAttachmentErrorCode(code: string | null): ChatAttachmentDto['errorCode'] {
  return ATTACHMENT_ERRORS.find((known) => known === code) ?? null
}
