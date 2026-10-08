// SPDX-License-Identifier: AGPL-3.0-only

/** The approvals `maintenance` job; its scheduler is in `core/queue/schedulers.ts`. */
export const APPROVALS_JOBS = {
  TIMEOUTS: 'approvalsTimeouts',
} as const

/** `approval-timeouts` runs every minute. */
export const TIMEOUTS_EVERY_MS = 60_000

/** Approvals one timeout run handles; the next run takes the rest. */
export const TIMEOUT_BATCH = 500

/** The shortest wait an escalation gives the new assignees. */
export const MIN_ESCALATION_WAIT_MS = 60_000

/** The system scope reason of the timeout sweeper. */
export const SYSTEM_REASON = 'approval-timeouts' as const

/** Pending approvals one cancel statement handles. */
export const CANCEL_BATCH = 500
