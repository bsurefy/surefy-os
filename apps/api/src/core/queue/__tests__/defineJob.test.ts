// SPDX-License-Identifier: AGPL-3.0-only
import { UnrecoverableError, type Job } from 'bullmq'
import { pino } from 'pino'
import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'

import { QUEUES } from '@/constants/queues.js'

import { defineJob, type JobRuntime } from '../index.js'

const runtime = { logger: pino({ level: 'silent' }) } as unknown as JobRuntime
const bullJob = (data: unknown) =>
  ({ id: 'job-1', name: 'ingestDocument', data, attemptsMade: 0 }) as unknown as Job<unknown>

describe('defineJob', () => {
  const process = vi.fn<(payload: { orgId: string }) => Promise<void>>(() => Promise.resolve())
  const job = defineJob({
    queue: QUEUES.KNOWLEDGE_INGESTION,
    name: 'ingestDocument',
    schema: z.object({ orgId: z.uuid(), documentId: z.uuid() }),
    options: { attempts: 2 },
    process: () => process,
  })

  it('keeps the queue, name and options', () => {
    expect(job).toMatchObject({
      queue: 'knowledge-ingestion',
      name: 'ingestDocument',
      options: { attempts: 2 },
    })
  })

  it('validates the payload and hands the parsed value to the processor', async () => {
    const payload = {
      orgId: '0199c0de-0000-7000-8000-000000000001',
      documentId: '0199c0de-0000-7000-8000-000000000002',
    }
    const handler = job.bind(runtime)
    await handler(bullJob({ ...payload, extra: 'dropped' }))
    expect(process).toHaveBeenCalledWith(payload, expect.anything())
  })

  it('fails without retry on an invalid payload', async () => {
    const handler = job.bind(runtime)
    await expect(handler(bullJob({ orgId: 'nope' }))).rejects.toBeInstanceOf(UnrecoverableError)
  })

  it('rethrows processor errors so BullMQ retries', async () => {
    const failing = defineJob({
      queue: QUEUES.EMAIL,
      name: 'sendEmail',
      schema: z.object({}),
      process: () => () => Promise.reject(new Error('smtp down')),
    })
    await expect(failing.bind(runtime)(bullJob({}))).rejects.toThrow('smtp down')
  })
})
