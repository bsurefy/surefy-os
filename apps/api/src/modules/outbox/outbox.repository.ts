// SPDX-License-Identifier: AGPL-3.0-only
import { eq, inArray, sql } from 'drizzle-orm'

import { outboxEvents } from '@/database/tables/index.js'

import type { ClaimedOutboxEvent } from './outbox.types.js'
import type { DbExecutor } from '@/core/database/index.js'

export interface NewOutboxEvent {
  organizationId: string | null
  topic: string
  payload: Record<string, unknown>
  dedupeKey: string | null
  availableAt?: Date
  requestId: string | null
}

/**
 * `outbox_events`. Producers insert in their tenant transaction; the claim and every status change
 * run in the relay's `db.system('outbox-relay')` transaction. Producers never write `dispatched`.
 */
export class OutboxRepository {
  /** Inserts the event; a duplicate `(topic, dedupe_key)` is ignored. Returns whether it was new. */
  async insert(tx: DbExecutor, event: NewOutboxEvent): Promise<boolean> {
    const rows = await tx
      .insert(outboxEvents)
      .values({
        organizationId: event.organizationId,
        topic: event.topic,
        payload: event.payload,
        dedupeKey: event.dedupeKey,
        requestId: event.requestId,
        ...(event.availableAt === undefined ? {} : { availableAt: event.availableAt }),
      })
      .onConflictDoNothing({
        target: [outboxEvents.topic, outboxEvents.dedupeKey],
        where: sql`${outboxEvents.dedupeKey} is not null`,
      })
      .returning({ id: outboxEvents.id })
    return rows.length > 0
  }

  /** Pending rows that are due, locked for this transaction (outbox_events_pending_idx). */
  async claim(tx: DbExecutor, limit: number): Promise<ClaimedOutboxEvent[]> {
    const result = await tx.execute<{
      id: string
      organization_id: string | null
      topic: string
      payload: Record<string, unknown>
      attempts: number
    }>(sql`
      select id, organization_id, topic, payload, attempts
      from outbox_events
      where status = 'pending' and available_at <= now()
      order by available_at, id
      limit ${limit}
      for update skip locked`)
    return result.rows.map((row) => ({
      id: row.id,
      organizationId: row.organization_id,
      topic: row.topic,
      payload: row.payload,
      attempts: row.attempts,
    }))
  }

  async markDispatched(tx: DbExecutor, ids: readonly string[]): Promise<void> {
    if (ids.length === 0) return
    await tx
      .update(outboxEvents)
      .set({ status: 'dispatched', dispatchedAt: sql`now()`, lastError: null })
      .where(inArray(outboxEvents.id, [...ids]))
  }

  /** A failed enqueue: `pending` again after the delay, or `failed` for good. */
  async markRetry(
    tx: DbExecutor,
    id: string,
    patch: { attempts: number; delayMs: number; failed: boolean; lastError: string },
  ): Promise<void> {
    await tx
      .update(outboxEvents)
      .set({
        status: patch.failed ? 'failed' : 'pending',
        attempts: patch.attempts,
        availableAt: sql`now() + make_interval(secs => ${patch.delayMs / 1000})`,
        lastError: patch.lastError,
      })
      .where(eq(outboxEvents.id, id))
  }
}
