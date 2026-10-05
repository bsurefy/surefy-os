// SPDX-License-Identifier: AGPL-3.0-only
import { QUEUES, type QueueName } from '@/constants/queues.js'
import {
  SEAL_AUDIT_LOG_JOB_NAME,
  VERIFY_AUDIT_LOG_JOB_NAME,
} from '@/modules/audit/audit.constants.js'
import { CHAT_JOBS } from '@/modules/chats/chats.constants.js'
import { DATA_CONTROL_JOBS } from '@/modules/dataControl/dataControl.constants.js'
import { KNOWLEDGE_SCHEDULER } from '@/modules/knowledge/knowledge.constants.js'
import { OUTBOX_SCHEDULER } from '@/modules/outbox/outbox.constants.js'
import { USAGE_JOBS } from '@/modules/usage/usage.constants.js'
import { VAULT_JOBS } from '@/modules/vault/vault.constants.js'

import type { Queues } from './queues.js'
import type { Logger } from '@/core/logger/index.js'

/** A BullMQ job scheduler: a stable kebab-case ID, so restarts update it instead of duplicating it. */
export interface SchedulerDefinition {
  id: string
  queue: QueueName
  repeat: { pattern: string } | { every: number }
  job: { name: string; data?: Record<string, unknown> }
}

/**
 * The recurring system jobs (background-jobs.md, "Recurring system jobs"), in UTC. Each module adds
 * its schedulers here once its job processors exist.
 */
export const SYSTEM_SCHEDULERS: readonly SchedulerDefinition[] = [
  {
    id: 'aggregate-usage-hourly',
    queue: QUEUES.USAGE,
    repeat: { pattern: '5 * * * *' },
    job: { name: USAGE_JOBS.AGGREGATE, data: { mode: 'hourly' } },
  },
  {
    id: 'recompute-usage-nightly',
    queue: QUEUES.USAGE,
    repeat: { pattern: '15 3 * * *' },
    job: { name: USAGE_JOBS.AGGREGATE, data: { mode: 'nightly' } },
  },
  {
    id: 'sweep-chat-streams',
    queue: QUEUES.MAINTENANCE,
    repeat: { pattern: '*/5 * * * *' },
    job: { name: CHAT_JOBS.SWEEP_STREAMS },
  },
  {
    id: 'cleanup-chat-attachments-daily',
    queue: QUEUES.MAINTENANCE,
    repeat: { pattern: '25 2 * * *' },
    job: { name: CHAT_JOBS.CLEANUP_ATTACHMENTS },
  },
  {
    id: 'seal-audit-log',
    queue: QUEUES.MAINTENANCE,
    repeat: { pattern: '* * * * *' },
    job: { name: SEAL_AUDIT_LOG_JOB_NAME },
  },
  {
    id: 'verify-audit-nightly',
    queue: QUEUES.MAINTENANCE,
    repeat: { pattern: '40 1 * * *' },
    job: { name: VERIFY_AUDIT_LOG_JOB_NAME },
  },
  {
    id: 'ensure-partitions-daily',
    queue: QUEUES.MAINTENANCE,
    repeat: { pattern: '10 2 * * *' },
    job: { name: DATA_CONTROL_JOBS.ENSURE_PARTITIONS },
  },
  {
    id: 'cleanup-daily',
    queue: QUEUES.MAINTENANCE,
    repeat: { pattern: '40 2 * * *' },
    job: { name: DATA_CONTROL_JOBS.CLEANUP },
  },
  {
    id: 'purge-soft-deleted-daily',
    queue: QUEUES.MAINTENANCE,
    repeat: { pattern: '10 3 * * *' },
    job: { name: DATA_CONTROL_JOBS.PURGE_SOFT_DELETED },
  },
  {
    id: 'organization-purge-due',
    queue: QUEUES.MAINTENANCE,
    repeat: { pattern: '10 4 * * *' },
    job: { name: DATA_CONTROL_JOBS.SCHEDULE_PURGES },
  },
  {
    id: 'vault-keys-daily',
    queue: QUEUES.MAINTENANCE,
    repeat: { pattern: '40 3 * * *' },
    job: { name: VAULT_JOBS.EXPIRE_KEYS },
  },
  {
    id: 'vault-key-rotation-daily',
    queue: QUEUES.MAINTENANCE,
    repeat: { pattern: '30 4 * * *' },
    job: { name: VAULT_JOBS.ROTATE_KEYS },
  },
  {
    id: 'vault-sync-daily',
    queue: QUEUES.MAINTENANCE,
    repeat: { pattern: '50 3 * * *' },
    job: { name: VAULT_JOBS.SYNC_MODELS },
  },
  KNOWLEDGE_SCHEDULER,
  OUTBOX_SCHEDULER,
  {
    id: 'vault-servers-health',
    queue: QUEUES.MAINTENANCE,
    repeat: { every: 5 * 60_000 },
    job: { name: VAULT_JOBS.CHECK_SERVERS },
  },
]

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
