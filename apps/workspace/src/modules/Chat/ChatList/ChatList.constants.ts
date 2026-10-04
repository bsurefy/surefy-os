// SPDX-License-Identifier: AGPL-3.0-only
import type { ExportFormat } from '@surefy/contracts'

/** Wait after the last keystroke before searching titles and message text. */
export const SEARCH_DEBOUNCE_MS = 300

/** Date groups of the chat list, newest first (chat.md §1). */
export const DATE_GROUPS = ['today', 'yesterday', 'previous7', 'previous30', 'older'] as const
export type DateGroup = (typeof DATE_GROUPS)[number]

export const DAYS_PREVIOUS_WEEK = 7
export const DAYS_PREVIOUS_MONTH = 30

/** The formats a chat exports to, and the export kind each one starts. */
export const CHAT_EXPORT_FORMATS = ['pdf', 'markdown', 'json'] as const satisfies ExportFormat[]
export type ChatExportFormat = (typeof CHAT_EXPORT_FORMATS)[number]

export const CHAT_EXPORT_KIND = {
  pdf: 'chat_pdf',
  markdown: 'chat_markdown',
  json: 'chat_json',
} as const satisfies Record<ChatExportFormat, string>

/** The chat list, or Recently deleted in its place. */
export type ChatListView = 'chats' | 'deleted'
