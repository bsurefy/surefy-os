// SPDX-License-Identifier: AGPL-3.0-only
import { sql } from 'drizzle-orm'
import {
  bigint,
  boolean,
  check,
  foreignKey,
  index,
  jsonb,
  pgTable,
  real,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'

import {
  APPROVAL_DECISION_REASONS,
  APPROVAL_KINDS,
  APPROVAL_RESOLVED_BY,
  APPROVAL_RISKS,
  APPROVAL_STATUSES,
  APPROVAL_TIMEOUT_ACTIONS,
  APPROVER_SUBJECT_TYPES,
  ORG_ROLES,
} from '@surefy/contracts'
import type {
  ApprovalDecisionReason,
  ApprovalKind,
  ApprovalPayload,
  ApprovalResolvedBy,
  ApprovalRisk,
  ApprovalStatus,
  ApprovalTimeoutAction,
  ApproverSubjectType,
  OrgRole,
} from '@surefy/contracts'

import { users } from './auth.tables.js'
import { organizationMembers, organizations } from './organizations.tables.js'
import { teams } from './teams.tables.js'
import { enumCheck } from '../checks.js'
import { currency, id, orgId, timestamps } from '../columns.js'
import { tenantPolicy } from '../policies.js'

// Approvals (database/guard-and-approvals.md, §4–5): every decision a person must make. FORCE RLS
// is in the security migration. `agent_id`, `agent_run_id`, `flow_id` and `flow_run_id` are plain
// uuid columns until the agents and flows tables exist (their foreign keys, `set null`, join with
// those tables).

export const approvals = pgTable(
  'approvals',
  {
    id: id(),
    organizationId: orgId(organizations),
    kind: text().$type<ApprovalKind>().notNull(),
    status: text().$type<ApprovalStatus>().notNull().default('pending'),
    title: text().notNull(),
    /** `ApprovalPayload` v1. */
    payload: jsonb().$type<ApprovalPayload>().notNull(),
    /** Set by "Edit and approve"; the action runs with it. */
    editedPayload: jsonb().$type<ApprovalPayload>(),
    amountMicros: bigint({ mode: 'number' }),
    ...currency(),
    /** 0 to 1: the AI's confidence for the action. */
    confidence: real(),
    risk: text().$type<ApprovalRisk>().notNull().default('low'),
    /** A guardrail id, or `agent:{agentId}:v{n}:{ruleId}` / `flow:{flowId}:v{n}:{nodeId}`. */
    ruleRef: text(),
    /** Deterministic key of the requesting step: a retried Guard check never creates a second approval. */
    dedupeKey: text(),
    /** V1: → agents.id (set null). */
    agentId: uuid(),
    /** V1: → agent_runs.id (set null). */
    agentRunId: uuid(),
    /** V2: → flows.id (set null). */
    flowId: uuid(),
    /** V2: → flow_runs.id (set null). */
    flowRunId: uuid(),
    requestedByUserId: uuid().references(() => users.id, { onDelete: 'set null' }),
    decidedByUserId: uuid().references(() => users.id, { onDelete: 'set null' }),
    decidedAt: timestamp({ withTimezone: true }),
    decisionReason: text().$type<ApprovalDecisionReason>(),
    decisionNote: text(),
    /** Fixed when the approval is created: the amount against `guard_settings.step_up_amount_micros`. */
    requiresStepUp: boolean().notNull().default(false),
    /** `created_at + waitMinutes`; null waits until decided or canceled. */
    expiresAt: timestamp({ withTimezone: true }),
    timeoutAction: text().$type<ApprovalTimeoutAction>(),
    escalatedAt: timestamp({ withTimezone: true }),
    resolvedBy: text().$type<ApprovalResolvedBy>(),
    ...timestamps(),
  },
  (t) => [
    unique('approvals_organization_id_id_key').on(t.organizationId, t.id), // target of composite FKs
    uniqueIndex('approvals_organization_id_dedupe_key_key')
      .on(t.organizationId, t.dedupeKey)
      .where(sql`${t.dedupeKey} is not null`),
    enumCheck('approvals_kind_check', t.kind, APPROVAL_KINDS),
    enumCheck('approvals_status_check', t.status, APPROVAL_STATUSES),
    enumCheck('approvals_risk_check', t.risk, APPROVAL_RISKS),
    enumCheck('approvals_decision_reason_check', t.decisionReason, APPROVAL_DECISION_REASONS),
    enumCheck('approvals_timeout_action_check', t.timeoutAction, APPROVAL_TIMEOUT_ACTIONS),
    enumCheck('approvals_resolved_by_check', t.resolvedBy, APPROVAL_RESOLVED_BY),
    check(
      'approvals_decision_check',
      sql`not (${t.status} = 'rejected' and ${t.resolvedBy} = 'user') or ${t.decisionReason} is not null`,
    ),
    check(
      'approvals_terminal_check',
      sql`(${t.status} = 'pending' and ${t.resolvedBy} is null and ${t.decidedAt} is null)
        or (${t.status} <> 'pending' and ${t.resolvedBy} is not null and ${t.decidedAt} is not null)`,
    ),
    check('approvals_timeout_check', sql`${t.expiresAt} is null or ${t.timeoutAction} is not null`),
    check('approvals_confidence_check', sql`${t.confidence} between 0 and 1`),
    check('approvals_amount_check', sql`${t.amountMicros} >= 0`),
    // the queue, oldest first, and "approvals waiting" counts
    index('approvals_pending_idx')
      .on(t.organizationId, t.createdAt, t.id)
      .where(sql`${t.status} = 'pending'`),
    // timeout sweeper (system scope)
    index('approvals_expiry_idx')
      .on(t.expiresAt)
      .where(sql`${t.status} = 'pending' and ${t.expiresAt} is not null`),
    // "Decided today", median time to approve
    index('approvals_organization_id_decided_at_idx')
      .on(t.organizationId, t.decidedAt.desc())
      .where(sql`${t.decidedAt} is not null`),
    index('approvals_agent_id_idx')
      .on(t.agentId)
      .where(sql`${t.agentId} is not null`),
    index('approvals_agent_run_id_idx')
      .on(t.agentRunId)
      .where(sql`${t.agentRunId} is not null`),
    index('approvals_flow_id_idx')
      .on(t.flowId)
      .where(sql`${t.flowId} is not null`),
    index('approvals_flow_run_id_idx')
      .on(t.flowRunId)
      .where(sql`${t.flowRunId} is not null`),
    index('approvals_requested_by_user_id_idx')
      .on(t.requestedByUserId)
      .where(sql`${t.requestedByUserId} is not null`),
    index('approvals_decided_by_user_id_idx')
      .on(t.decidedByUserId)
      .where(sql`${t.decidedByUserId} is not null`),
    tenantPolicy('approvals', t.organizationId),
  ],
)

export const approvalAssignees = pgTable(
  'approval_assignees',
  {
    id: id(),
    organizationId: orgId(organizations),
    approvalId: uuid().notNull(),
    subjectType: text().$type<ApproverSubjectType>().notNull(),
    userId: uuid(),
    teamId: uuid(),
    /** The role and every role above it may decide. */
    role: text().$type<OrgRole>(),
    /** Escalation rows are added when a timeout escalates. */
    source: text().$type<'rule' | 'escalation'>().notNull().default('rule'),
    /** No `updated_at`: rows are inserted or deleted, never updated. */
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique('approval_assignees_organization_id_id_key').on(t.organizationId, t.id),
    foreignKey({
      name: 'approval_assignees_organization_id_approval_id_fkey',
      columns: [t.organizationId, t.approvalId],
      foreignColumns: [approvals.organizationId, approvals.id],
    }).onDelete('cascade'),
    foreignKey({
      name: 'approval_assignees_organization_id_user_id_fkey',
      columns: [t.organizationId, t.userId],
      foreignColumns: [organizationMembers.organizationId, organizationMembers.userId],
    }).onDelete('cascade'),
    foreignKey({
      name: 'approval_assignees_organization_id_team_id_fkey',
      columns: [t.organizationId, t.teamId],
      foreignColumns: [teams.organizationId, teams.id],
    }).onDelete('cascade'),
    enumCheck('approval_assignees_subject_type_check', t.subjectType, APPROVER_SUBJECT_TYPES),
    enumCheck('approval_assignees_role_check', t.role, ORG_ROLES),
    enumCheck('approval_assignees_source_check', t.source, ['rule', 'escalation']),
    check(
      'approval_assignees_subject_check',
      sql`(${t.subjectType} = 'user' and ${t.userId} is not null and ${t.teamId} is null and ${t.role} is null)
        or (${t.subjectType} = 'team' and ${t.teamId} is not null and ${t.userId} is null and ${t.role} is null)
        or (${t.subjectType} = 'role' and ${t.role} is not null and ${t.userId} is null and ${t.teamId} is null)`,
    ),
    // one row per subject: the unused subject columns are null, which must still collide
    unique('approval_assignees_subject_key')
      .on(t.organizationId, t.approvalId, t.subjectType, t.userId, t.teamId, t.role)
      .nullsNotDistinct(),
    index('approval_assignees_organization_id_user_id_idx')
      .on(t.organizationId, t.userId)
      .where(sql`${t.userId} is not null`),
    index('approval_assignees_organization_id_team_id_idx')
      .on(t.organizationId, t.teamId)
      .where(sql`${t.teamId} is not null`),
    index('approval_assignees_organization_id_role_idx')
      .on(t.organizationId, t.role)
      .where(sql`${t.role} is not null`),
    tenantPolicy('approval_assignees', t.organizationId),
  ],
)
