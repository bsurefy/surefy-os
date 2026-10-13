// SPDX-License-Identifier: AGPL-3.0-only
import type { AgentRunStatus } from '@surefy/contracts'
import type { StatusTone } from '@surefy/ui/components/DataDisplay'

/** The value of the status chip that shows every run. */
export const ANY_STATUS = 'any'

export const SEARCH_DEBOUNCE_MS = 300

export const STATUS_TONE: Record<AgentRunStatus, StatusTone> = {
  queued: 'neutral',
  running: 'info',
  waiting_approval: 'warning',
  succeeded: 'success',
  failed: 'destructive',
  canceled: 'neutral',
  timed_out: 'destructive',
}

/** The statuses the chips offer, in the order of a run's life. */
export const STATUS_FILTERS = [
  'running',
  'waiting_approval',
  'succeeded',
  'failed',
  'canceled',
  'timed_out',
] as const satisfies readonly AgentRunStatus[]
