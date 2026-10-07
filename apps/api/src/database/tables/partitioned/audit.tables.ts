// SPDX-License-Identifier: AGPL-3.0-only
import {
  bigint,
  inet,
  jsonb,
  pgTable,
  primaryKey,
  real,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core'

import type { AuditActorType, AuditMetadata, AuditOutcome, AuditVia } from '@surefy/contracts'

import { bytea } from '../../columnTypes.js'

// The append-only audit log (database/usage-budgets-and-audit.md, §4), partitioned monthly on
// `created_at`. Typed queries only: the parent, its policy, indexes, triggers and partitions are
// custom SQL, and drizzle.config.ts does not read this folder (conventions-and-security.md, §8).

const at = () => timestamp({ withTimezone: true })

export const auditLogs = pgTable(
  'audit_logs',
  {
    id: uuid().notNull(),
    organizationId: uuid().notNull(),
    actorType: text().$type<AuditActorType>().notNull(),
    actorUserId: uuid(),
    actorApiKeyId: uuid(),
    actorRefId: uuid(),
    via: text().$type<AuditVia>().notNull(),
    accessGrantId: uuid(),
    partnerId: uuid(),
    action: text().notNull(),
    targetType: text().notNull(),
    targetId: uuid(),
    outcome: text().$type<AuditOutcome>().notNull(),
    metadata: jsonb().$type<AuditMetadata>().notNull(),
    reason: text(),
    modelKey: text(),
    confidence: real(),
    requestId: text(),
    ip: inet(),
    userAgent: text(),
    entryHash: bytea().notNull(),
    chainSeq: bigint({ mode: 'number' }),
    chainHash: bytea(),
    sealedAt: at(),
    /** The partition key: the event time, supplied by the audit service. */
    createdAt: at().notNull(),
  },
  (t) => [primaryKey({ name: 'audit_logs_pkey', columns: [t.id, t.createdAt] })],
)
