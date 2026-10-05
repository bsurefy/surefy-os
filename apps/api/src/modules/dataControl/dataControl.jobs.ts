// SPDX-License-Identifier: AGPL-3.0-only
import { type Job } from 'bullmq'
import { z } from 'zod'

import { QUEUES } from '@/constants/queues.js'
import { defineJob, type JobDefinition } from '@/core/queue/index.js'

import { DATA_CONTROL_JOBS } from './dataControl.constants.js'

import type { DataControlService } from './dataControl.service.js'
import type { DataExportsService } from './dataExports/dataExports.service.js'
import type { DataRetentionService } from './dataRetention/dataRetention.service.js'

export const prepareDataExportPayloadSchema = z.object({
  orgId: z.uuid(),
  dataRequestId: z.uuid(),
})
export type PrepareDataExportPayload = z.infer<typeof prepareDataExportPayloadSchema>

export const prepareExportPayloadSchema = z.object({ orgId: z.uuid(), exportId: z.uuid() })
export type PrepareExportPayload = z.infer<typeof prepareExportPayloadSchema>

export const purgeOrganizationPayloadSchema = z.object({ orgId: z.uuid(), purgeId: z.uuid() })
export type PurgeOrganizationPayload = z.infer<typeof purgeOrganizationPayloadSchema>

const emptyPayloadSchema = z.object({})
type EmptyPayload = z.infer<typeof emptyPayloadSchema>

/** The last attempt BullMQ makes for this job. */
const isLastAttempt = (job: Job<unknown>): boolean =>
  job.attemptsMade + 1 >= (job.opts.attempts ?? 1)

/** The services the jobs call; read when a job runs (they are built after the jobs). */
export interface DataControlJobServices {
  dataControl: () => DataControlService
  dataExports: () => DataExportsService
  retention: () => DataRetentionService
}

export interface DataControlJobs {
  prepareDataExport: JobDefinition<PrepareDataExportPayload>
  prepareExport: JobDefinition<PrepareExportPayload>
  purgeOrganization: JobDefinition<PurgeOrganizationPayload>
  cleanup: JobDefinition<EmptyPayload>
  ensurePartitions: JobDefinition<EmptyPayload>
  purgeSoftDeleted: JobDefinition<EmptyPayload>
  schedulePurges: JobDefinition<EmptyPayload>
}

/**
 * The `data-control` jobs (full exports, background exports, organization purges) and the
 * `maintenance` jobs of retention (background-jobs.md, "Recurring system jobs").
 */
export function createDataControlJobs(services: DataControlJobServices): DataControlJobs {
  return {
    prepareDataExport: defineJob({
      queue: QUEUES.DATA_CONTROL,
      name: DATA_CONTROL_JOBS.PREPARE_DATA_EXPORT,
      schema: prepareDataExportPayloadSchema,
      options: { attempts: 3 },
      process: () => async (payload, job) => {
        try {
          await services.dataControl().prepareArchive(payload.orgId, payload.dataRequestId)
        } catch (error) {
          if (isLastAttempt(job)) {
            await services.dataControl().failArchive(payload.orgId, payload.dataRequestId)
          }
          throw error
        }
      },
    }),
    prepareExport: defineJob({
      queue: QUEUES.DATA_CONTROL,
      name: DATA_CONTROL_JOBS.PREPARE_EXPORT,
      schema: prepareExportPayloadSchema,
      options: { attempts: 3 },
      process: () => async (payload, job) => {
        try {
          await services.dataExports().prepare(payload.orgId, payload.exportId)
        } catch (error) {
          if (isLastAttempt(job)) await services.dataExports().fail(payload.orgId, payload.exportId)
          throw error
        }
      },
    }),
    // One attempt: a failure is recorded on the purge row and the next daily run retries.
    purgeOrganization: defineJob({
      queue: QUEUES.DATA_CONTROL,
      name: DATA_CONTROL_JOBS.PURGE_ORGANIZATION,
      schema: purgeOrganizationPayloadSchema,
      options: { attempts: 1 },
      process: () => (payload) =>
        services.retention().purgeOrganization(payload.orgId, payload.purgeId),
    }),
    cleanup: defineJob({
      queue: QUEUES.MAINTENANCE,
      name: DATA_CONTROL_JOBS.CLEANUP,
      schema: emptyPayloadSchema,
      options: { attempts: 2 },
      process: (runtime) => async () => {
        runtime.logger.info({ removed: await services.retention().cleanup() }, 'cleanup done')
      },
    }),
    ensurePartitions: defineJob({
      queue: QUEUES.MAINTENANCE,
      name: DATA_CONTROL_JOBS.ENSURE_PARTITIONS,
      schema: emptyPayloadSchema,
      process: () => () => services.retention().maintainPartitions(),
    }),
    purgeSoftDeleted: defineJob({
      queue: QUEUES.MAINTENANCE,
      name: DATA_CONTROL_JOBS.PURGE_SOFT_DELETED,
      schema: emptyPayloadSchema,
      options: { attempts: 2 },
      process: (runtime) => async () => {
        runtime.logger.info(
          { purged: await services.retention().purgeSoftDeleted() },
          'soft-deleted rows purged',
        )
      },
    }),
    schedulePurges: defineJob({
      queue: QUEUES.MAINTENANCE,
      name: DATA_CONTROL_JOBS.SCHEDULE_PURGES,
      schema: emptyPayloadSchema,
      options: { attempts: 2 },
      process: (runtime) => async () => {
        const started = await services.retention().scheduleDuePurges()
        if (started > 0) runtime.logger.info({ started }, 'organization purges started')
      },
    }),
  }
}
