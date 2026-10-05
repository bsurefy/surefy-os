// SPDX-License-Identifier: AGPL-3.0-only
import { QUEUES } from '@/constants/queues.js'

export const OUTBOX_JOBS = {
  RELAY: 'relayOutbox',
  DELIVER: 'deliverOutboxEvent',
} as const

/** Rows one relay transaction claims. */
export const OUTBOX_RELAY_BATCH = 100

/** Batches one relay run claims at most; the next run (5 seconds later) takes the rest. */
export const OUTBOX_RELAY_MAX_BATCHES = 20

/** A row whose enqueue failed this many times becomes `failed` and raises an alert. */
export const OUTBOX_MAX_ATTEMPTS = 10

/** Retry delay after a failed enqueue: 5 s × 2^attempts, at most an hour. */
export const OUTBOX_RETRY_BASE_MS = 5_000
export const OUTBOX_RETRY_MAX_MS = 3_600_000

/** The best-effort relay after a commit; BullMQ collapses kicks while one is waiting. */
export const OUTBOX_KICK_JOB_ID = 'outbox-kick'

/** `outbox-relay`: every 5 seconds; several replicas are safe (`SKIP LOCKED`). */
export const OUTBOX_SCHEDULER = {
  id: 'outbox-relay',
  queue: QUEUES.OUTBOX,
  repeat: { every: 5_000 },
  job: { name: OUTBOX_JOBS.RELAY },
} as const
