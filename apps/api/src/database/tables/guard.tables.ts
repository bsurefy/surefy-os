// SPDX-License-Identifier: AGPL-3.0-only
import { sql } from 'drizzle-orm'
import {
  bigint,
  boolean,
  check,
  date,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'

import {
  GUARD_QUICK_APPROVE_RISKS,
  GUARDRAIL_SCOPES,
  GUARDRAIL_TYPES,
  PII_ACTIONS,
  PII_SCOPES,
  PII_TYPES,
} from '@surefy/contracts'
import type {
  GuardQuickApproveRisk,
  GuardrailDefinition,
  GuardrailScope,
  GuardrailType,
  PiiAction,
  PiiScope,
  PiiType,
} from '@surefy/contracts'

import { agents } from './agents.tables.js'
import { users } from './auth.tables.js'
import { organizations } from './organizations.tables.js'
import { teams } from './teams.tables.js'
import { enumCheck } from '../checks.js'
import { currency, id, orgId, timestamps } from '../columns.js'
import { tenantPolicy } from '../policies.js'

// Guard (database/guard-and-approvals.md, §1–3; guard_stats_daily in usage-budgets-and-audit.md,
// §9). FORCE RLS is in the security migration.

const count = () => bigint({ mode: 'number' }).notNull().default(0)

/** The organization's Guard defaults; a missing row means `GUARD_DEFAULTS`. */
export const guardSettings = pgTable(
  'guard_settings',
  {
    organizationId: orgId(organizations).primaryKey(),
    autoThresholdBp: integer().notNull().default(9000),
    reviewThresholdBp: integer().notNull().default(6000),
    quickApproveMaxAmountMicros: bigint({ mode: 'number' }).notNull().default(0),
    quickApproveMaxRisk: text().$type<GuardQuickApproveRisk>().notNull().default('low'),
    /** Approvals above this amount need re-authentication; null = never. */
    stepUpAmountMicros: bigint({ mode: 'number' }),
    ...currency(),
    targetDecisionMinutes: integer().notNull().default(60),
    updatedByUserId: uuid().references(() => users.id, { onDelete: 'set null' }),
    ...timestamps(),
  },
  (t) => [
    check(
      'guard_settings_thresholds_check',
      sql`${t.reviewThresholdBp} >= 0 and ${t.reviewThresholdBp} < ${t.autoThresholdBp} and ${t.autoThresholdBp} <= 10000`,
    ),
    check(
      'guard_settings_amounts_check',
      sql`${t.quickApproveMaxAmountMicros} >= 0 and (${t.stepUpAmountMicros} is null or ${t.stepUpAmountMicros} >= 0)`,
    ),
    check('guard_settings_target_decision_minutes_check', sql`${t.targetDecisionMinutes} > 0`),
    enumCheck('guard_settings_quick_approve_max_risk_check', t.quickApproveMaxRisk, [
      ...GUARD_QUICK_APPROVE_RISKS,
    ]),
    index('guard_settings_updated_by_user_id_idx')
      .on(t.updatedByUserId)
      .where(sql`${t.updatedByUserId} is not null`),
    tenantPolicy('guard_settings', t.organizationId),
  ],
)

/** Organization- and team-scoped rules; agent and flow rules live in their versioned definitions. */
export const guardrails = pgTable(
  'guardrails',
  {
    id: id(),
    organizationId: orgId(organizations),
    name: text().notNull(),
    type: text().$type<GuardrailType>().notNull(),
    scope: text().$type<GuardrailScope>().notNull().default('organization'),
    teamId: uuid(),
    /** `Guardrail` v1; its `kind` equals `type`. */
    definition: jsonb().$type<GuardrailDefinition>().notNull(),
    isEnabled: boolean().notNull().default(true),
    isLocked: boolean().notNull().default(false),
    lockedByUserId: uuid().references(() => users.id, { onDelete: 'set null' }),
    lockedReason: text(),
    createdByUserId: uuid().references(() => users.id, { onDelete: 'set null' }),
    updatedByUserId: uuid().references(() => users.id, { onDelete: 'set null' }),
    ...timestamps(),
  },
  (t) => [
    unique('guardrails_organization_id_id_key').on(t.organizationId, t.id),
    uniqueIndex('guardrails_organization_id_name_key').on(t.organizationId, sql`lower(${t.name})`),
    foreignKey({
      name: 'guardrails_organization_id_team_id_fkey',
      columns: [t.organizationId, t.teamId],
      foreignColumns: [teams.organizationId, teams.id],
    }).onDelete('cascade'),
    enumCheck('guardrails_type_check', t.type, GUARDRAIL_TYPES),
    enumCheck('guardrails_scope_values_check', t.scope, GUARDRAIL_SCOPES),
    check(
      'guardrails_scope_check',
      sql`(${t.scope} = 'organization' and ${t.teamId} is null) or (${t.scope} = 'team' and ${t.teamId} is not null)`,
    ),
    check('guardrails_lock_check', sql`not ${t.isLocked} or ${t.lockedReason} is not null`),
    // loading the active rule set
    index('guardrails_organization_id_type_idx')
      .on(t.organizationId, t.type)
      .where(sql`${t.isEnabled}`),
    index('guardrails_organization_id_team_id_idx')
      .on(t.organizationId, t.teamId)
      .where(sql`${t.teamId} is not null`),
    index('guardrails_locked_by_user_id_idx')
      .on(t.lockedByUserId)
      .where(sql`${t.lockedByUserId} is not null`),
    index('guardrails_created_by_user_id_idx')
      .on(t.createdByUserId)
      .where(sql`${t.createdByUserId} is not null`),
    index('guardrails_updated_by_user_id_idx')
      .on(t.updatedByUserId)
      .where(sql`${t.updatedByUserId} is not null`),
    tenantPolicy('guardrails', t.organizationId),
  ],
)

/** The personal-data filter: the organization's action per type, and team and agent exceptions. */
export const piiFilterRules = pgTable(
  'pii_filter_rules',
  {
    id: id(),
    organizationId: orgId(organizations),
    piiType: text().$type<PiiType>().notNull(),
    customLabel: text(),
    customPattern: text(),
    action: text().$type<PiiAction>().notNull(),
    scope: text().$type<PiiScope>().notNull().default('organization'),
    teamId: uuid(),
    /** ⇉ (organization_id, agent_id) → agents (cascade). */
    agentId: uuid(),
    createdByUserId: uuid().references(() => users.id, { onDelete: 'set null' }),
    updatedByUserId: uuid().references(() => users.id, { onDelete: 'set null' }),
    ...timestamps(),
  },
  (t) => [
    unique('pii_filter_rules_organization_id_id_key').on(t.organizationId, t.id),
    // pii_filter_rules_builtin_key and pii_filter_rules_custom_key: `nulls not distinct` partial
    // unique indexes, in the security migration
    foreignKey({
      name: 'pii_filter_rules_organization_id_team_id_fkey',
      columns: [t.organizationId, t.teamId],
      foreignColumns: [teams.organizationId, teams.id],
    }).onDelete('cascade'),
    foreignKey({
      name: 'pii_filter_rules_organization_id_agent_id_fkey',
      columns: [t.organizationId, t.agentId],
      foreignColumns: [agents.organizationId, agents.id],
    }).onDelete('cascade'),
    enumCheck('pii_filter_rules_pii_type_check', t.piiType, PII_TYPES),
    enumCheck('pii_filter_rules_action_check', t.action, PII_ACTIONS),
    enumCheck('pii_filter_rules_scope_values_check', t.scope, PII_SCOPES),
    check(
      'pii_filter_rules_custom_check',
      sql`(${t.piiType} = 'custom') = (${t.customLabel} is not null and ${t.customPattern} is not null)`,
    ),
    check(
      'pii_filter_rules_scope_check',
      sql`(${t.scope} = 'organization' and ${t.teamId} is null and ${t.agentId} is null)
        or (${t.scope} = 'team' and ${t.teamId} is not null and ${t.agentId} is null)
        or (${t.scope} = 'agent' and ${t.agentId} is not null and ${t.teamId} is null)`,
    ),
    index('pii_filter_rules_organization_id_team_id_idx')
      .on(t.organizationId, t.teamId)
      .where(sql`${t.teamId} is not null`),
    index('pii_filter_rules_organization_id_agent_id_idx')
      .on(t.organizationId, t.agentId)
      .where(sql`${t.agentId} is not null`),
    index('pii_filter_rules_created_by_user_id_idx')
      .on(t.createdByUserId)
      .where(sql`${t.createdByUserId} is not null`),
    index('pii_filter_rules_updated_by_user_id_idx')
      .on(t.updatedByUserId)
      .where(sql`${t.updatedByUserId} is not null`),
    tenantPolicy('pii_filter_rules', t.organizationId),
  ],
)

/**
 * Daily Guard activity. Rebuilt one UTC day at a time by the `guardStatsRollup` job (delete and
 * insert in one transaction), so it can always be recomputed from the steps, usage events and
 * approvals.
 */
export const guardStatsDaily = pgTable(
  'guard_stats_daily',
  {
    organizationId: orgId(organizations),
    day: date({ mode: 'string' }).notNull(),
    actionsAuto: count(),
    actionsDoubleCheck: count(),
    actionsHuman: count(),
    actionsBlockedRule: count(),
    actionsBlockedLimit: count(),
    piiMaskedRequests: count(),
    localRequests: count(),
    approvalsRequested: count(),
    approvalsApproved: count(),
    approvalsRejected: count(),
    approvalsExpired: count(),
    /** Over approvals decided by a person; the median is computed from `approvals`. */
    approvalDecisionSecondsSum: count(),
  },
  (t) => [
    primaryKey({ name: 'guard_stats_daily_pkey', columns: [t.organizationId, t.day] }),
    tenantPolicy('guard_stats_daily', t.organizationId),
  ],
)
