// SPDX-License-Identifier: AGPL-3.0-only
import { Queue, type JobsOptions } from 'bullmq'
import { Redis } from 'ioredis'

import type { JobDefinition } from './defineJob.js'
import type { QueueName } from '@/constants/queues.js'
import type { Config } from '@/core/config/index.js'
import type { Logger } from '@/core/logger/index.js'

/** Failed jobs are kept for inspection and retry; completed ones expire. */
export const DEFAULT_JOB_OPTIONS = {
  attempts: 5,
  backoff: { type: 'exponential', delay: 10_000 },
  removeOnComplete: { age: 86_400, count: 1000 },
  removeOnFail: false,
} as const satisfies JobsOptions

export interface EnqueueOptions {
  /** Deterministic ID (`ingest-${documentId}`): BullMQ ignores a duplicate while the first job exists. No `:`; not a plain integer. */
  jobId?: string
  delayMs?: number
}

export interface Queues {
  /** The producer handle of a queue (created on first use). */
  get(name: QueueName): Queue
  /** Validates the payload against the job's schema, then adds it to the job's queue. Returns the job ID. */
  enqueue<Payload>(
    job: JobDefinition<Payload>,
    payload: Payload,
    options?: EnqueueOptions,
  ): Promise<string>
  /** A dedicated ioredis connection for a BullMQ Worker (`maxRetriesPerRequest: null`). */
  createWorkerConnection(): Redis
  close(): Promise<void>
}

const JOB_ID_PATTERN = /^(?!\d+$)[^:]+$/

/**
 * The BullMQ queue registry. The producer connection keeps ioredis defaults, so an enqueue fails
 * fast when Redis is down; worker connections are blocking and never give up (BullMQ needs that).
 */
export function createQueues(config: Config, logger: Logger): Queues {
  const queues = new Map<QueueName, Queue>()
  const connections: Redis[] = []

  const connect = (options: { blocking: boolean }): Redis => {
    const connection = new Redis(config.redis.url, {
      lazyConnect: true,
      ...(options.blocking ? { maxRetriesPerRequest: null } : {}),
    })
    connection.on('error', (error) => {
      logger.warn({ err: error, blocking: options.blocking }, 'queue redis connection error')
    })
    connections.push(connection)
    return connection
  }

  let producer: Redis | undefined
  const producerConnection = () => (producer ??= connect({ blocking: false }))

  const get = (name: QueueName): Queue => {
    let queue = queues.get(name)
    if (!queue) {
      queue = new Queue(name, {
        connection: producerConnection(),
        defaultJobOptions: DEFAULT_JOB_OPTIONS,
      })
      queue.on('error', (error) => {
        logger.error({ err: error, queue: name }, 'queue error')
      })
      queues.set(name, queue)
    }
    return queue
  }

  return {
    get,
    async enqueue(job, payload, options = {}) {
      const parsed = job.schema.safeParse(payload)
      if (!parsed.success) {
        throw new TypeError(`invalid payload for job ${job.name}: ${parsed.error.message}`)
      }
      if (options.jobId !== undefined && !JOB_ID_PATTERN.test(options.jobId)) {
        throw new TypeError(`invalid job id ${options.jobId}: no ':' and not a plain integer`)
      }
      const added = await get(job.queue).add(job.name, parsed.data, {
        ...job.options,
        ...(options.jobId === undefined ? {} : { jobId: options.jobId }),
        ...(options.delayMs === undefined ? {} : { delay: options.delayMs }),
      })
      // BullMQ always assigns an id; the type is optional only for jobs not yet added.
      return added.id ?? options.jobId ?? ''
    },
    createWorkerConnection: () => connect({ blocking: true }),
    async close() {
      await Promise.all([...queues.values()].map((queue) => queue.close()))
      await Promise.all(
        connections.map(async (connection) => {
          // A lazy connection that never opened has nothing to quit.
          if (connection.status === 'wait' || connection.status === 'end') {
            connection.disconnect()
            return
          }
          await connection.quit()
        }),
      )
    },
  }
}
