// SPDX-License-Identifier: AGPL-3.0-only
import type { ApprovalStatus } from '@surefy/contracts'
import type { StatusTone } from '@surefy/ui/components/DataDisplay'

/** The two lists of the page: what waits for a decision, and what was decided today. */
export const APPROVAL_VIEWS = ['pending', 'decided'] as const
export type ApprovalView = (typeof APPROVAL_VIEWS)[number]

/** The "any" value of a single-choice filter. */
export const ANY = 'any'

export const STATUS_TONE: Record<ApprovalStatus, StatusTone> = {
  pending: 'warning',
  approved: 'success',
  rejected: 'destructive',
  expired: 'neutral',
  canceled: 'neutral',
}

/** Search typing waits this long before the list asks again. */
export const SEARCH_DEBOUNCE_MS = 300
/** Rows of the queue and its refresh interval: other people decide while this one is open. */
export const QUEUE_REFRESH_MS = 30_000
