// SPDX-License-Identifier: AGPL-3.0-only
import {
  bigint,
  boolean,
  char,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core'

import type {
  ModelCallCredentialScope,
  ModelCallOutcome,
  UsageBilledVia,
  UsageDataLocation,
  UsageKind,
  UsageSourceModule,
  UsageSubjectType,
} from '@surefy/contracts'

// One row per metered call (database/usage-budgets-and-audit.md, §1), partitioned monthly on
// `created_at` and append-only. Typed queries only: the parent, its policy, checks, indexes and
// partitions are custom SQL, and drizzle.config.ts does not read this folder.

const tokens = () => bigint({ mode: 'number' }).notNull().default(0)

export const usageEvents = pgTable(
  'usage_events',
  {
    id: uuid().notNull(),
    organizationId: uuid().notNull(),
    userId: uuid(),
    teamId: uuid(),
    apiKeyId: uuid(),
    sourceModule: text().$type<UsageSourceModule>().notNull(),
    subjectType: text().$type<UsageSubjectType>(),
    subjectId: uuid(),
    sourceRefId: uuid(),
    kind: text().$type<UsageKind>().notNull(),
    modelKey: text().notNull(),
    vaultModelId: uuid(),
    credentialId: uuid(),
    credentialScope: text().$type<ModelCallCredentialScope>().notNull(),
    providerKey: text().notNull(),
    inputTokens: tokens(),
    outputTokens: tokens(),
    cachedInputTokens: tokens(),
    reasoningTokens: tokens(),
    units: tokens(),
    costMicros: tokens(),
    currency: char({ length: 3 }).notNull(),
    billedVia: text().$type<UsageBilledVia>().notNull(),
    latencyMs: integer(),
    outcome: text().$type<ModelCallOutcome>().notNull(),
    errorCode: text(),
    routed: boolean().notNull().default(false),
    fallbackFromModelKey: text(),
    piiMasked: boolean().notNull().default(false),
    dataLocation: text().$type<UsageDataLocation>().notNull(),
    dedupeKey: text().notNull(),
    requestId: text(),
    /** The partition key: the call start, supplied by the caller and reused on retries. */
    createdAt: timestamp({ withTimezone: true }).notNull(),
  },
  (t) => [primaryKey({ name: 'usage_events_pkey', columns: [t.id, t.createdAt] })],
)
