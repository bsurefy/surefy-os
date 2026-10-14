// SPDX-License-Identifier: AGPL-3.0-only
import { sql } from 'drizzle-orm'
import {
  bigint,
  boolean,
  char,
  check,
  date,
  foreignKey,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core'

import {
  BUDGET_DEFAULT_ALERT_THRESHOLDS_BP,
  BUDGET_ON_REACHED_ACTIONS,
  BUDGET_PERIODS,
  BUDGET_SCOPES,
  USAGE_BILLED_VIA,
  USAGE_SOURCE_MODULES,
  USAGE_SUBJECT_TYPES,
} from '@surefy/contracts'
import type {
  BudgetOnReachedAction,
  BudgetPeriod,
  BudgetScope,
  UsageBilledVia,
  UsageSourceModule,
  UsageSubjectType,
} from '@surefy/contracts'

import { users } from './auth.tables.js'
import { organizationMembers, organizations } from './organizations.tables.js'
import { teams } from './teams.tables.js'
import { enumCheck } from '../checks.js'
import { currency, id, orgId, timestamps } from '../columns.js'
import { systemOnlyPolicy, tenantPolicy } from '../policies.js'

// Budgets, their alerts and the usage rollups (database/usage-budgets-and-audit.md, §2–3, §6–8,
// §10). The rollups are rebuilt by the `aggregateUsage` job from `usage_events` and, for
// `run_stats_daily`, from finished runs; their ids are snapshots without foreign keys, so rows
// survive member removal and team deletion. The partitioned `usage_events` parent is custom SQL;
// its typed definition is in partitioned/usage.tables.ts. Guard stats live with the guard tables.

const count = () => bigint({ mode: 'number' }).notNull().default(0)

/** The rollups `usage_rollup_state` tracks; run and Guard stats join in V1. */
export const USAGE_ROLLUPS = [
  'usage_daily',
  'usage_monthly',
  'run_stats_daily',
  'guard_stats_daily',
] as const
export type UsageRollup = (typeof USAGE_ROLLUPS)[number]

/** AI cost budgets for the organization, a team or one person; one per scope. */
export const budgets = pgTable(
  'budgets',
  {
    id: id(),
    organizationId: orgId(organizations),
    scope: text().$type<BudgetScope>().notNull(),
    /** ⇉ (organization_id, team_id) → teams (cascade). */
    teamId: uuid(),
    /** ⇉ (organization_id, user_id) → organization_members (cascade). */
    userId: uuid(),
    period: text().$type<BudgetPeriod>().notNull().default('month'),
    amountMicros: bigint({ mode: 'number' }).notNull(),
    /** Equals `organizations.currency` (service check). */
    ...currency(),
    onReached: text().$type<BudgetOnReachedAction>().notNull().default('notify_only'),
    alertThresholdsBp: integer()
      .array()
      .notNull()
      .default(sql.raw(`'{${BUDGET_DEFAULT_ALERT_THRESHOLDS_BP.join(',')}}'`)),
    isEnabled: boolean().notNull().default(true),
    createdByUserId: uuid().references(() => users.id, { onDelete: 'set null' }),
    updatedByUserId: uuid().references(() => users.id, { onDelete: 'set null' }),
    ...timestamps(),
  },
  (t) => [
    unique('budgets_organization_id_id_key').on(t.organizationId, t.id),
    unique('budgets_scope_key')
      .on(t.organizationId, t.scope, t.teamId, t.userId)
      .nullsNotDistinct(),
    foreignKey({
      name: 'budgets_organization_id_team_id_fkey',
      columns: [t.organizationId, t.teamId],
      foreignColumns: [teams.organizationId, teams.id],
    }).onDelete('cascade'),
    foreignKey({
      name: 'budgets_organization_id_user_id_fkey',
      columns: [t.organizationId, t.userId],
      foreignColumns: [organizationMembers.organizationId, organizationMembers.userId],
    }).onDelete('cascade'), // removing a member removes their personal limit
    enumCheck('budgets_scope_values_check', t.scope, BUDGET_SCOPES),
    enumCheck('budgets_period_check', t.period, BUDGET_PERIODS),
    enumCheck('budgets_on_reached_check', t.onReached, BUDGET_ON_REACHED_ACTIONS),
    check(
      'budgets_scope_check',
      sql`(${t.scope} = 'organization' and ${t.teamId} is null and ${t.userId} is null)
        or (${t.scope} = 'team' and ${t.teamId} is not null and ${t.userId} is null)
        or (${t.scope} = 'user' and ${t.userId} is not null and ${t.teamId} is null)`,
    ),
    check('budgets_amount_micros_check', sql`${t.amountMicros} >= 0`),
    check(
      'budgets_alert_thresholds_bp_check',
      sql`1 <= all(${t.alertThresholdsBp}) and 10000 >= all(${t.alertThresholdsBp})`,
    ),
    index('budgets_organization_id_team_id_idx')
      .on(t.organizationId, t.teamId)
      .where(sql`${t.teamId} is not null`),
    index('budgets_organization_id_user_id_idx')
      .on(t.organizationId, t.userId)
      .where(sql`${t.userId} is not null`),
    index('budgets_created_by_user_id_idx')
      .on(t.createdByUserId)
      .where(sql`${t.createdByUserId} is not null`),
    index('budgets_updated_by_user_id_idx')
      .on(t.updatedByUserId)
      .where(sql`${t.updatedByUserId} is not null`),
    tenantPolicy('budgets', t.organizationId),
  ],
)

/**
 * One row per budget, period and threshold crossed; the unique key makes each alert fire once.
 * Rows are never updated.
 */
export const budgetAlerts = pgTable(
  'budget_alerts',
  {
    id: id(),
    organizationId: orgId(organizations),
    /** ⇉ (organization_id, budget_id) → budgets (cascade). */
    budgetId: uuid().notNull(),
    /** First day of the UTC month. */
    periodStart: date({ mode: 'string' }).notNull(),
    thresholdBp: integer().notNull(),
    /** Spend when the threshold was detected, for the notification. */
    spentMicros: bigint({ mode: 'number' }).notNull(),
    ...currency(),
    triggeredAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique('budget_alerts_organization_id_id_key').on(t.organizationId, t.id),
    foreignKey({
      name: 'budget_alerts_organization_id_budget_id_fkey',
      columns: [t.organizationId, t.budgetId],
      foreignColumns: [budgets.organizationId, budgets.id],
    }).onDelete('cascade'),
    unique('budget_alerts_budget_id_period_start_threshold_bp_key').on(
      t.budgetId,
      t.periodStart,
      t.thresholdBp,
    ),
    index('budget_alerts_organization_id_triggered_at_idx').on(
      t.organizationId,
      t.triggeredAt.desc(),
    ),
    tenantPolicy('budget_alerts', t.organizationId),
  ],
)

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

/** Daily run outcomes per agent and flow: runs over time, success rate, duration, trust score. */
export const runStatsDaily = pgTable(
  'run_stats_daily',
  {
    organizationId: uuid()
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    /** UTC day of the run's `finished_at`. */
    day: date({ mode: 'string' }).notNull(),
    subjectType: text().$type<UsageSubjectType>().notNull(),
    /** Agent or flow id; no foreign key, so the stats outlive a purged agent. */
    subjectId: uuid().notNull(),
    currency: char({ length: 3 }).notNull(),
    /** Finished non-test runs. */
    runsTotal: count(),
    runsSucceeded: count(),
    /** Succeeded and not corrected by a person: the trust score numerator. */
    runsSucceededUncorrected: count(),
    runsFailed: count(),
    runsTimedOut: count(),
    runsCanceled: count(),
    runsNeededHuman: count(),
    runsHumanCorrected: count(),
    /** Guard-checked steps by band. */
    actionsAuto: count(),
    actionsDoubleCheck: count(),
    actionsHuman: count(),
    actionsBlocked: count(),
    /** Average duration = `duration_ms_sum / runs_total`. */
    durationMsSum: count(),
    costMicros: count(),
  },
  (t) => [
    primaryKey({
      name: 'run_stats_daily_pkey',
      columns: [t.organizationId, t.subjectType, t.subjectId, t.day, t.currency],
    }),
    index('run_stats_daily_organization_id_day_idx').on(t.organizationId, t.day),
    enumCheck('run_stats_daily_subject_type_check', t.subjectType, USAGE_SUBJECT_TYPES),
    tenantPolicy('run_stats_daily', t.organizationId),
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
