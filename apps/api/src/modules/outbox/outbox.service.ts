// SPDX-License-Identifier: AGPL-3.0-only
import { UnrecoverableError } from 'bullmq'

import {
  OUTBOX_KICK_JOB_ID,
  OUTBOX_MAX_ATTEMPTS,
  OUTBOX_RELAY_BATCH,
  OUTBOX_RELAY_MAX_BATCHES,
} from './outbox.constants.js'
import { isOutboxTopic, OUTBOX_PAYLOADS } from './outbox.topics.js'
import { outboxJobId, relayErrorText, relayRetryDelayMs } from './outbox.utils.js'

import type { DeliverOutboxEventPayload, RelayOutboxPayload } from './outbox.jobs.js'
import type { OutboxRepository } from './outbox.repository.js'
import type { OutboxTopic } from './outbox.topics.js'
import type { OutboxDelivery, OutboxEventInput, OutboxHandler } from './outbox.types.js'
import type { Database, DbExecutor } from '@/core/database/index.js'
import type { Logger } from '@/core/logger/index.js'
import type { JobDefinition, Queues } from '@/core/queue/index.js'

export interface OutboxServiceDeps {
  db: Database
  queues: Queues
  logger: Logger
  repository: OutboxRepository
  /** The core modules' handlers, and the extensions' (`onEvent`), read at delivery time. */
  handlers: () => readonly OutboxHandler[]
  relayJob: () => JobDefinition<RelayOutboxPayload>
  deliverJob: () => JobDefinition<DeliverOutboxEventPayload>
}

/** What one relay run did. */
export interface RelayResult {
  dispatched: number
  retried: number
  failed: number
}

/**
 * The transactional outbox (database/platform-and-jobs.md, "Outbox relay algorithm"): services
 * write events in their business transaction, the relay hands due rows to BullMQ, and the
 * delivery job runs the topic's handlers. Delivery is at least once and unordered.
 */
export class OutboxService {
  constructor(private readonly deps: OutboxServiceDeps) {}

  /**
   * Writes an event in the caller's transaction, so it exists if and only if the change commits.
   * The payload is validated against the topic's schema. Returns false for a duplicate `dedupeKey`.
   */
  async write<T extends OutboxTopic>(tx: DbExecutor, event: OutboxEventInput<T>): Promise<boolean> {
    const payload = OUTBOX_PAYLOADS[event.topic].parse(event.payload) as Record<string, unknown>
    return this.deps.repository.insert(tx, {
      organizationId: event.orgId,
      topic: event.topic,
      payload,
      dedupeKey: event.dedupeKey ?? null,
      ...(event.availableAt === undefined ? {} : { availableAt: event.availableAt }),
      requestId: event.requestId ?? null,
    })
  }

  /** A best-effort relay right after a commit, to cut latency; the schedule relays anyway. */
  async kick(): Promise<void> {
    try {
      await this.deps.queues.enqueue(this.deps.relayJob(), {}, { jobId: OUTBOX_KICK_JOB_ID })
    } catch (error) {
      this.deps.logger.warn({ err: error }, 'outbox kick not enqueued')
    }
  }

  /**
   * `outbox-relay`: claims due rows (`SKIP LOCKED`), enqueues one delivery job per row with the job
   * id `outbox-{id}`, and records the result in the same transaction. A crash before the commit
   * leaves the rows pending; BullMQ ignores the duplicate job id on the next run.
   */
  async relay(): Promise<RelayResult> {
    const total: RelayResult = { dispatched: 0, retried: 0, failed: 0 }
    for (let batch = 0; batch < OUTBOX_RELAY_MAX_BATCHES; batch++) {
      const { claimed, ...result } = await this.deps.db.system('outbox-relay', (tx) =>
        this.relayBatch(tx),
      )
      total.dispatched += result.dispatched
      total.retried += result.retried
      total.failed += result.failed
      if (claimed < OUTBOX_RELAY_BATCH) break
    }
    return total
  }

  /**
   * `deliverOutboxEvent`: runs every handler of the topic in turn. An invalid payload never
   * succeeds on a retry, so it fails the job for good; a handler error lets BullMQ retry, and the
   * handlers that already ran run again (they are idempotent).
   */
  async deliver(job: DeliverOutboxEventPayload): Promise<void> {
    const handlers = this.deps.handlers().filter((handler) => handler.topic === job.topic)
    if (handlers.length === 0) {
      this.deps.logger.warn({ topic: job.topic, eventId: job.eventId }, 'outbox topic unhandled')
      return
    }
    if (!isOutboxTopic(job.topic)) {
      throw new UnrecoverableError(`unknown outbox topic ${job.topic}`)
    }
    const parsed = OUTBOX_PAYLOADS[job.topic].safeParse(job.payload)
    if (!parsed.success) {
      throw new UnrecoverableError(`invalid payload for outbox topic ${job.topic}`)
    }
    const delivery: OutboxDelivery = {
      eventId: job.eventId,
      orgId: job.orgId ?? null,
      topic: job.topic,
      payload: parsed.data,
    }
    for (const handler of handlers) {
      await handler.handle(delivery)
    }
  }

  // ---- Private ------------------------------------------------------------------------------

  private async relayBatch(tx: DbExecutor): Promise<RelayResult & { claimed: number }> {
    const repository = this.deps.repository
    const rows = await repository.claim(tx, OUTBOX_RELAY_BATCH)
    const dispatched: string[] = []
    let retried = 0
    let failed = 0
    for (const row of rows) {
      try {
        await this.deps.queues.enqueue(
          this.deps.deliverJob(),
          {
            eventId: row.id,
            topic: row.topic,
            payload: row.payload,
            ...(row.organizationId === null ? {} : { orgId: row.organizationId }),
          },
          { jobId: outboxJobId(row.id) },
        )
        dispatched.push(row.id)
      } catch (error) {
        const attempts = row.attempts + 1
        const isFailed = attempts >= OUTBOX_MAX_ATTEMPTS
        await repository.markRetry(tx, row.id, {
          attempts,
          delayMs: relayRetryDelayMs(attempts),
          failed: isFailed,
          lastError: relayErrorText(error),
        })
        if (isFailed) {
          failed++
          // the alert: an operator retries it by setting the row back to `pending`
          this.deps.logger.error(
            { err: error, eventId: row.id, topic: row.topic, attempts },
            'outbox event failed',
          )
        } else {
          retried++
          this.deps.logger.warn(
            { err: error, eventId: row.id, topic: row.topic, attempts },
            'outbox relay retry',
          )
        }
      }
    }
    await repository.markDispatched(tx, dispatched)
    return { claimed: rows.length, dispatched: dispatched.length, retried, failed }
  }
}
