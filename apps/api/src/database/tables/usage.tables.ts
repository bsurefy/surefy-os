// SPDX-License-Identifier: AGPL-3.0-only
import { sql } from 'drizzle-orm'
import {
  bigint,
  char,
  check,
  date,
  index,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core'

import { USAGE_BILLED_VIA, USAGE_SOURCE_MODULES, USAGE_SUBJECT_TYPES } from '@surefy/contracts'
import type { UsageBilledVia, UsageSourceModule, UsageSubjectType } from '@surefy/contracts'

import { organizations } from './organizations.tables.js'
import { enumCheck } from '../checks.js'
import { timestamps } from '../columns.js'
import { systemOnlyPolicy, tenantPolicy } from '../policies.js'

// Usage rollups (database/usage-budgets-and-audit.md, §6–7, §10). Rebuilt from `usage_events` by
// the `aggregateUsage` job; ids are snapshots without foreign keys, so rows survive member removal
// and team deletion. The partitioned `usage_events` parent is custom SQL; its typed definition is
// in partitioned/usage.tables.ts. Budgets, run and Guard stats arrive with their V1 modules.

const count = () => bigint({ mode: 'number' }).notNull().default(0)

/** The rollups `usage_rollup_state` tracks; run and Guard stats join in V1. */
export const USAGE_ROLLUPS = [
  'usage_daily',
  'usage_monthly',
  'run_stats_daily',
  'guard_stats_daily',
] as const
export type UsageRollup = (typeof USAGE_ROLLUPS)[number]

export const USAGE_MONTHLY_SCOPES = ['organization', 'team', 'user'] as const
export type UsageMonthlyScope = (typeof USAGE_MONTHLY_SCOPES)[number]

/** Daily totals at the finest grain Insights filters on; the grain is the key. */
export const usageDaily = pgTable(
  'usage_daily',
  {
    organizationId: uuid()
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    /** UTC day of `usage_events.created_at`. */
    day: date({ mode: 'string' }).notNull(),
    userId: uuid(),
    /** Primary team at event time. */
    teamId: uuid(),
    sourceModule: text().$type<UsageSourceModule>().notNull(),
    subjectType: text().$type<UsageSubjectType>(),
    subjectId: uuid(),
    modelKey: text().notNull(),
    credentialId: uuid(),
    billedVia: text().$type<UsageBilledVia>().notNull(),
    currency: char({ length: 3 }).notNull(),
    requests: count(),
    errors: count(),
    blocked: count(),
    inputTokens: count(),
    outputTokens: count(),
    cachedInputTokens: count(),
    reasoningTokens: count(),
    units: count(),
    costMicros: count(),
  },
  (t) => [
    unique('usage_daily_grain_key')
      .on(
        t.organizationId,
        t.day,
        t.userId,
        t.teamId,
        t.sourceModule,
        t.subjectType,
        t.subjectId,
        t.modelKey,
        t.credentialId,
        t.billedVia,
        t.currency,
      )
      .nullsNotDistinct(),
    index('usage_daily_organization_id_credential_id_day_idx')
      .on(t.organizationId, t.credentialId, t.day)
      .where(sql`${t.credentialId} is not null`),
    index('usage_daily_organization_id_subject_idx')
      .on(t.organizationId, t.subjectType, t.subjectId, t.day)
      .where(sql`${t.subjectId} is not null`),
    index('usage_daily_organization_id_team_id_day_idx').on(t.organizationId, t.teamId, t.day),
    enumCheck('usage_daily_source_module_check', t.sourceModule, USAGE_SOURCE_MODULES),
    enumCheck('usage_daily_subject_type_check', t.subjectType, USAGE_SUBJECT_TYPES),
    enumCheck('usage_daily_billed_via_check', t.billedVia, USAGE_BILLED_VIA),
    tenantPolicy('usage_daily', t.organizationId),
  ],
)

/** Monthly totals per budget scope: the organization, each team and each person. */
export const usageMonthly = pgTable(
  'usage_monthly',
  {
    organizationId: uuid()
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    /** First day of the UTC month. */
    month: date({ mode: 'string' }).notNull(),
    scope: text().$type<UsageMonthlyScope>().notNull(),
    /** `organization_id` for the organization scope, else the team or user. */
    scopeId: uuid().notNull(),
    currency: char({ length: 3 }).notNull(),
    requests: count(),
    inputTokens: count(),
    outputTokens: count(),
    costMicros: count(),
  },
  (t) => [
    primaryKey({
      name: 'usage_monthly_pkey',
      columns: [t.organizationId, t.month, t.scope, t.scopeId, t.currency],
    }),
    check('usage_monthly_month_check', sql`extract(day from ${t.month}) = 1`),
    enumCheck('usage_monthly_scope_check', t.scope, USAGE_MONTHLY_SCOPES),
    tenantPolicy('usage_monthly', t.organizationId),
  ],
)

/** The aggregation watermark and run bookkeeping, one row per rollup (system scope only). */
export const usageRollupState = pgTable(
  'usage_rollup_state',
  {
    rollup: text().$type<UsageRollup>().primaryKey(),
    /** Event time up to which the rollup is complete; never moves backwards. */
    watermark: timestamp({ withTimezone: true, mode: 'string' }).notNull(),
    lastHourlyStartedAt: timestamp({ withTimezone: true }),
    lastHourlyFinishedAt: timestamp({ withTimezone: true }),
    lastNightlyFinishedAt: timestamp({ withTimezone: true }),
    /** Cleared on the next successful run. */
    lastErrorCode: text(),
    ...timestamps(),
  },
  (t) => [
    enumCheck('usage_rollup_state_rollup_check', t.rollup, USAGE_ROLLUPS),
    systemOnlyPolicy('usage_rollup_state'),
  ],
)
