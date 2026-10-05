// SPDX-License-Identifier: AGPL-3.0-only
import { UnrecoverableError } from 'bullmq'
import { z } from 'zod'

import { QUEUES } from '@/constants/queues.js'
import { defineJob, type JobDefinition, type RegisteredJob } from '@/core/queue/index.js'

import { KNOWLEDGE_JOBS } from '../knowledge.constants.js'
import { classifyFailure } from './knowledgeIngestion.errors.js'

import type { KnowledgeIngestionService } from './knowledgeIngestion.service.js'
import type { KnowledgeReembedService } from './knowledgeReembed.service.js'
import type { KnowledgeSyncService } from './knowledgeSync.service.js'

/** The services the jobs call; read when a job runs, so the jobs can be built first. */
export interface KnowledgeJobServices {
  ingestion: KnowledgeIngestionService
  sync: KnowledgeSyncService
  reembed: KnowledgeReembedService
}

const ingestPayload = z.object({
  orgId: z.uuid(),
  documentId: z.uuid(),
  /** Timeouts so far: the first is retried, the second is final. */
  timeouts: z.number().int().nonnegative().optional(),
})
export type IngestPayload = z.infer<typeof ingestPayload>

const syncPayload = z.object({ orgId: z.uuid(), sourceId: z.uuid() })
export type SyncPayload = z.infer<typeof syncPayload>

const reembedPayload = z.object({ orgId: z.uuid(), baseId: z.uuid() })
export type ReembedPayload = z.infer<typeof reembedPayload>

const noPayload = z.object({})

/** What the knowledge services enqueue and the worker runs, on the `knowledge-ingestion` queue. */
export interface KnowledgeJobs {
  ingestDocument: JobDefinition<IngestPayload>
  syncSource: JobDefinition<SyncPayload>
  reembedBase: JobDefinition<ReembedPayload>
  scheduleSyncs: JobDefinition<Record<string, never>>
  all: readonly RegisteredJob[]
}

/** The ingestion work as BullMQ jobs. */
export function createKnowledgeJobs(services: () => KnowledgeJobServices): KnowledgeJobs {
  /**
   * `ingestDocument({ orgId, documentId })`: retried with backoff on outages; unsupported files
   * and a second timeout fail the document at once, and so does the last attempt.
   */
  const ingestDocument = defineJob({
    queue: QUEUES.KNOWLEDGE_INGESTION,
    name: KNOWLEDGE_JOBS.INGEST_DOCUMENT,
    schema: ingestPayload,
    options: { attempts: 4, removeOnComplete: true },
    process: () => async (payload, job) => {
      const { orgId, documentId } = payload
      try {
        await services().ingestion.ingestDocument(orgId, documentId, {
          resume: job.attemptsMade > 0,
        })
      } catch (error) {
        const failure = classifyFailure(error)
        const lastAttempt = job.attemptsMade + 1 >= (job.opts.attempts ?? 1)
        const secondTimeout = failure.timeout && (payload.timeouts ?? 0) >= 1
        if (!failure.retryable || secondTimeout || lastAttempt) {
          await services().ingestion.failDocument(orgId, documentId, failure.code)
          throw new UnrecoverableError(failure.code)
        }
        if (failure.timeout) await job.updateData({ ...payload, timeouts: 1 })
        throw error
      }
    },
  })

  const syncSource = defineJob({
    queue: QUEUES.KNOWLEDGE_INGESTION,
    name: KNOWLEDGE_JOBS.SYNC_SOURCE,
    schema: syncPayload,
    options: { attempts: 3, removeOnComplete: true },
    process: () => async (payload) => {
      await services().sync.syncSource(payload.orgId, payload.sourceId)
    },
  })

  const reembedBase = defineJob({
    queue: QUEUES.KNOWLEDGE_INGESTION,
    name: KNOWLEDGE_JOBS.REEMBED_BASE,
    schema: reembedPayload,
    options: { attempts: 3, removeOnComplete: true },
    process: () => async (payload) => {
      await services().reembed.reembedBase(payload.orgId, payload.baseId)
    },
  })

  /** `scheduleKnowledgeSyncs` (scheduler `knowledge-sync`, every 5 minutes): one `syncSource` per due source. */
  const scheduleSyncs = defineJob({
    queue: QUEUES.KNOWLEDGE_INGESTION,
    name: KNOWLEDGE_JOBS.SCHEDULE_SYNCS,
    schema: noPayload,
    options: { attempts: 1, removeOnComplete: true },
    process: () => async () => {
      await services().sync.scheduleDueSyncs()
    },
  })

  return {
    ingestDocument,
    syncSource,
    reembedBase,
    scheduleSyncs,
    all: [ingestDocument, syncSource, reembedBase, scheduleSyncs],
  }
}
