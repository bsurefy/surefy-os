// SPDX-License-Identifier: AGPL-3.0-only
import { sql } from 'drizzle-orm'
import {
  check,
  index,
  jsonb,
  pgTable,
  smallint,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'

import { organizations } from './organizations.tables.js'
import { enumCheck } from '../checks.js'
import { id, timestamps } from '../columns.js'
import { ownedOrSystemPolicy } from '../policies.js'

// The transactional outbox (database/platform-and-jobs.md, §1 and "Outbox relay algorithm").

export const OUTBOX_EVENT_STATUSES = ['pending', 'dispatched', 'failed'] as const
export type OutboxEventStatus = (typeof OUTBOX_EVENT_STATUSES)[number]

const at = () => timestamp({ withTimezone: true })

/**
 * A side effect that must not be lost, written in the same transaction as the change that causes
 * it and relayed to BullMQ by the worker. Rows with a null organization (install-wide events) and
 * every relay read need system scope (RLS `owned-or-system`).
 */
export const outboxEvents = pgTable(
  'outbox_events',
  {
    /** Also the BullMQ job id suffix (`outbox-{id}`), so a re-relayed row never adds a second job. */
    id: id(),
    organizationId: uuid().references(() => organizations.id, { onDelete: 'cascade' }),
    /** `OUTBOX_TOPICS` in the outbox module; extensions add theirs. */
    topic: text().notNull(),
    /** Ids only, never content or secrets; validated against the topic's schema on write. */
    payload: jsonb().$type<Record<string, unknown>>().notNull(),
    /** For events that may be written twice, for example `chat.purged:{chatId}`. */
    dedupeKey: text(),
    status: text().$type<OutboxEventStatus>().notNull().default('pending'),
    attempts: smallint().notNull().default(0),
    /** Not relayed before this time (backoff, delayed effects). */
    availableAt: at().notNull().defaultNow(),
    dispatchedAt: at(),
    /** Error code and short message of the last failed relay; never payload data. */
    lastError: text(),
    /** The request or job that wrote the event, for tracing. */
    requestId: text(),
    ...timestamps(),
  },
  (t) => [
    // Also serves the per-organization lookups; satisfies the (organization_id, id) convention.
    unique('outbox_events_organization_id_id_key').on(t.organizationId, t.id),
    index('outbox_events_pending_idx')
      .on(t.availableAt, t.id)
      .where(sql`${t.status} = 'pending'`),
    uniqueIndex('outbox_events_topic_dedupe_key_key')
      .on(t.topic, t.dedupeKey)
      .where(sql`${t.dedupeKey} is not null`),
    index('outbox_events_cleanup_idx')
      .on(t.status, t.updatedAt)
      .where(sql`${t.status} <> 'pending'`),
    check('outbox_events_topic_check', sql`${t.topic} ~ '^[a-z_]+(\\.[a-z_]+)+$'`),
    enumCheck('outbox_events_status_check', t.status, OUTBOX_EVENT_STATUSES),
    ownedOrSystemPolicy('outbox_events', t.organizationId),
  ],
)
