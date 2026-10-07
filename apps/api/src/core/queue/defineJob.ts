// SPDX-License-Identifier: AGPL-3.0-only
import { UnrecoverableError, type Job, type JobsOptions } from 'bullmq'

import type { Queues } from './queues.js'
import type { QueueName } from '@/constants/queues.js'
import type { Cache } from '@/core/cache/index.js'
import type { Config } from '@/core/config/index.js'
import type { Database } from '@/core/database/index.js'
import type { Logger } from '@/core/logger/index.js'
import type { PublicModules } from '@/types/modules.js'
import type { z } from 'zod'

/** What a job processor factory receives: the container's clients and public module services. */
export interface JobRuntime {
  config: Config
  logger: Logger
  db: Database
  cache: Cache
  queues: Queues
  modules: PublicModules
}

export type JobProcessor<Payload> = (payload: Payload, job: Job<unknown>) => Promise<void>

/** The payload-agnostic view of a job, which the worker registers and extensions contribute. */
export interface RegisteredJob {
  readonly queue: QueueName
  readonly name: string
  readonly options: JobsOptions
  /** Builds the BullMQ handler once per worker: validates, logs, processes. */
  bind(runtime: JobRuntime): (job: Job<unknown>) => Promise<void>
}

export interface JobDefinition<Payload> extends RegisteredJob {
  readonly schema: z.ZodType<Payload>
  readonly processor: (runtime: JobRuntime) => JobProcessor<Payload>
}

export interface DefineJobInput<Payload> {
  queue: QueueName
  /** camelCase verb phrase, unique within its queue. */
  name: string
  schema: z.ZodType<Payload>
  /** Per-job overrides of the queue's default options (attempts, backoff…). */
  options?: JobsOptions
  process: (runtime: JobRuntime) => JobProcessor<Payload>
}

const orgIdOf = (payload: unknown): string | undefined =>
  typeof payload === 'object' && payload !== null && 'orgId' in payload
    ? String(payload.orgId)
    : undefined

/**
 * Declares a job: its queue, name, payload schema and processor. The payload is validated before
 * processing (an invalid payload is an `UnrecoverableError`), and start, finish and failure are
 * logged with `queue`, `jobName`, `jobId`, `orgId` and `attempt`.
 */
export function defineJob<Payload>(input: DefineJobInput<Payload>): JobDefinition<Payload> {
  const { queue, name, schema, process: processor } = input
  const options = input.options ?? {}
  return {
    queue,
    name,
    schema,
    options,
    processor,
    bind(runtime) {
      const run = processor(runtime)
      return async (job) => {
        const parsed = schema.safeParse(job.data)
        if (!parsed.success) {
          throw new UnrecoverableError(`invalid payload for job ${name}: ${parsed.error.message}`)
        }
        const log = runtime.logger.child({
          queue,
          jobName: name,
          jobId: job.id,
          orgId: orgIdOf(parsed.data),
          attempt: job.attemptsMade + 1,
        })
        const startedAt = performance.now()
        log.info('job started')
        try {
          await run(parsed.data, job)
        } catch (error) {
          log.error(
            { err: error, durationMs: Math.round(performance.now() - startedAt) },
            'job failed',
          )
          throw error
        }
        log.info({ durationMs: Math.round(performance.now() - startedAt) }, 'job completed')
      }
    },
  }
}
