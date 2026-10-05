// SPDX-License-Identifier: AGPL-3.0-only
import { CHAT_ATTACHMENT_LIMITS, CHAT_DOCUMENT_TYPES, CHAT_IMAGE_TYPES } from '@surefy/contracts'

/** Messages of the thread, from the API, are loaded this many at a time (latest first). */
export const THREAD_PAGE_SIZE = 50

/** The thread follows new text only while the person is this close to the bottom (px). */
export const STICK_TO_BOTTOM_PX = 120

/** Where an answer that hit a rate limit waits before it is sent again. */
export const RATE_LIMIT_RETRY_SECONDS = 10

/** The four starters on a new chat; each fills the composer, "summarize" also opens the file picker. */
export const SUGGESTIONS = ['knowledge', 'summarize', 'draft', 'explain'] as const
export type SuggestionKey = (typeof SUGGESTIONS)[number]

/** Longest composer text shown without scrolling, in rows. */
export const COMPOSER_MAX_ROWS = 8

export const ATTACHMENT_ACCEPT = [...CHAT_IMAGE_TYPES, ...CHAT_DOCUMENT_TYPES].join(',')

/** The limits the composer states up front (chat.md §3). */
export const ATTACHMENT_LIMIT_MB = {
  image: CHAT_ATTACHMENT_LIMITS.maxImageBytes / (1024 * 1024),
  document: CHAT_ATTACHMENT_LIMITS.maxDocumentBytes / (1024 * 1024),
} as const

/** The hash links the citation chips use inside the answer's Markdown. */
export const SOURCE_HASH_PREFIX = '#source-'

/** `ThreadActivity` of the AI SDK's chat status. */
export const ACTIVITY_OF_STATUS = {
  submitted: 'submitted',
  streaming: 'streaming',
  ready: 'idle',
  error: 'idle',
} as const

/** The error codes the inline cards know; anything else gets the generic failure. */
export const THREAD_ERROR = {
  PROVIDER_UNAVAILABLE: 'MODEL_PROVIDER_UNAVAILABLE',
  BUDGET_EXCEEDED: 'BUDGET_EXCEEDED',
  CREDITS_EXHAUSTED: 'CREDITS_EXHAUSTED',
  RATE_LIMITED: 'RATE_LIMITED',
  MODEL_NOT_ALLOWED: 'MODEL_NOT_ALLOWED',
} as const

/** How long after Stop the stored (partial) answer is loaded: the server records it just after the request ends. */
export const STOP_RECONCILE_MS = 600
