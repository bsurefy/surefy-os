// SPDX-License-Identifier: AGPL-3.0-only
import { UnrecoverableError, Worker, type Job } from 'bullmq'

import type { JobRuntime, RegisteredJob } from './defineJob.js'
import type { QueueName } from '@/constants/queues.js'

/**
 * Creates one BullMQ `Worker` per queue that has jobs, with the concurrency from config. A job
 * name must be unique within its queue; an unknown job name on a queue is not retried.
 */
type JobHandler = (job: Job<unknown>) => Promise<void>

export function registerJobs(runtime: JobRuntime, jobs: readonly RegisteredJob[]): Worker[] {
  const byQueue = new Map<QueueName, Map<string, JobHandler>>()
  for (const job of jobs) {
    const handlers = byQueue.get(job.queue) ?? new Map<string, JobHandler>()
    if (handlers.has(job.name)) {
      throw new Error(`job ${job.name} is registered twice on queue ${job.queue}`)
    }
    handlers.set(job.name, job.bind(runtime))
    byQueue.set(job.queue, handlers)
  }

  return [...byQueue].map(([queue, handlers]) => {
    const worker = new Worker(
      queue,
      async (job: Job<unknown>) => {
        const handler = handlers.get(job.name)
        if (!handler) throw new UnrecoverableError(`unknown job ${job.name} on queue ${queue}`)
        await handler(job)
      },
      {
        connection: runtime.queues.createWorkerConnection(),
        concurrency: runtime.config.worker.concurrency,
      },
    )
    worker.on('error', (error) => {
      runtime.logger.error({ err: error, queue }, 'worker error')
    })
    worker.on('failed', (job, error) => {
      // Exhausted retries stay in the failed set; this is the operator's alert line.
      if (job && job.attemptsMade >= (job.opts.attempts ?? 1)) {
        runtime.logger.error(
          { err: error, queue, jobName: job.name, jobId: job.id, attempts: job.attemptsMade },
          'job exhausted its retries',
        )
      }
    })
    runtime.logger.info({ queue, jobs: [...handlers.keys()] }, 'worker started')
    return worker
  })
}
