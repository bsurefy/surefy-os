// SPDX-License-Identifier: AGPL-3.0-only
import { z } from 'zod'

import { QUEUES } from '@/constants/queues.js'
import { defineJob, type JobDefinition } from '@/core/queue/index.js'

import { OUTBOX_JOBS } from './outbox.constants.js'

import type { OutboxService } from './outbox.service.js'

export const relayOutboxPayloadSchema = z.object({})
export type RelayOutboxPayload = z.infer<typeof relayOutboxPayloadSchema>

/** The event as the relay hands it over: the stored payload plus its id, topic and organization. */
export const deliverOutboxEventPayloadSchema = z.object({
  eventId: z.uuid(),
  orgId: z.uuid().optional(),
  topic: z.string().min(1),
  payload: z.record(z.string(), z.unknown()),
})
export type DeliverOutboxEventPayload = z.infer<typeof deliverOutboxEventPayloadSchema>

export interface OutboxJobs {
  relay: JobDefinition<RelayOutboxPayload>
  deliver: JobDefinition<DeliverOutboxEventPayload>
}

/** The `outbox` queue: the relay (scheduled every 5 seconds, or kicked) and the delivery of one event. */
export function createOutboxJobs(service: () => OutboxService): OutboxJobs {
  return {
    // One attempt and nothing kept: the next run retries, and the kick's job id is free again.
    relay: defineJob({
      queue: QUEUES.OUTBOX,
      name: OUTBOX_JOBS.RELAY,
      schema: relayOutboxPayloadSchema,
      options: { attempts: 1, removeOnComplete: true, removeOnFail: true },
      process: (runtime) => async () => {
        const result = await service().relay()
        if (result.dispatched + result.retried + result.failed > 0) {
          runtime.logger.debug(result, 'outbox relayed')
        }
      },
    }),
    deliver: defineJob({
      queue: QUEUES.OUTBOX,
      name: OUTBOX_JOBS.DELIVER,
      schema: deliverOutboxEventPayloadSchema,
      process: () => (payload) => service().deliver(payload),
    }),
  }
}
