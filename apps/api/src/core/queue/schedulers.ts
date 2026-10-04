// SPDX-License-Identifier: AGPL-3.0-only
import type { Queues } from './queues.js'
import type { QueueName } from '@/constants/queues.js'
import type { Logger } from '@/core/logger/index.js'

/** A BullMQ job scheduler: a stable kebab-case ID, so restarts update it instead of duplicating it. */
export interface SchedulerDefinition {
  id: string
  queue: QueueName
  repeat: { pattern: string } | { every: number }
  job: { name: string; data?: Record<string, unknown> }
}

/**
 * The recurring system jobs (background-jobs.md, "Recurring system jobs"). Each module adds its
 * schedulers here once its job processors exist: `aggregate-usage-hourly`,
 * `recompute-usage-nightly` (usage), `ensure-partitions-daily`, `seal-audit-log`, `cleanup-daily`,
 * `purge-soft-deleted-daily` (maintenance).
 */
export const SYSTEM_SCHEDULERS: readonly SchedulerDefinition[] = []

/** Upserts every scheduler at worker startup; several replicas can do this safely. */
export async function registerSchedulers(
  queues: Queues,
  schedulers: readonly SchedulerDefinition[],
  logger: Logger,
): Promise<void> {
  for (const scheduler of schedulers) {
    await queues.get(scheduler.queue).upsertJobScheduler(scheduler.id, scheduler.repeat, {
      name: scheduler.job.name,
      data: scheduler.job.data ?? {},
    })
  }
  logger.info({ schedulers: schedulers.map((s) => s.id) }, 'schedulers registered')
}
