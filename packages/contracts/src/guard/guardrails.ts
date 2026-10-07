// SPDX-License-Identifier: AGPL-3.0-only
import { z } from 'zod'

import { basisPointsSchema, guardParamsSchema } from './thresholds.js'
import {
  APPROVAL_RISKS,
  APPROVAL_TIMEOUT_ACTIONS,
  APPROVERS_MAX,
  approverSchema,
} from '../approvals/schemas.js'
import { userRefDtoSchema } from '../auth/schemas.js'
import { multiValueQuery, searchQuery } from '../core/filters.js'
import { pageQuery, sortQuery } from '../core/pagination.js'
import { teamRefDtoSchema } from '../teams/schemas.js'
import { IMPACT_LISTED_MAX } from '../vault/schemas.js'

// Guardrails: organization- and team-scoped Guard rules (database/guard-and-approvals.md §2;
// Guard › Guardrails and the guardrail sheet). Routes, under /api/v1/orgs/:orgId/guard:
// GET/POST /guardrails · GET/PATCH/DELETE /guardrails/:guardrailId ·
// GET …/:guardrailId/impact · POST …/:guardrailId/{lock,unlock}.
// Agent- and flow-scoped rules live in their versioned definitions; the table lists them
// read-only. Adding or tightening saves directly; turning off, loosening or deleting is T2 with
// the impact and a reason for the audit log (GUARD_REASON_REQUIRED).

export const GUARDRAIL_TYPES = [
  'approval_rule',
  'threshold_override',
  'blocked_action',
  'action_limit',
  'content_filter',
] as const
export type GuardrailType = (typeof GUARDRAIL_TYPES)[number]

/** What the Guardrails table lists: stored rules plus the personal-data filters, read-only. */
export const GUARD_TABLE_TYPES = [...GUARDRAIL_TYPES, 'data_filter'] as const
export type GuardTableType = (typeof GUARD_TABLE_TYPES)[number]

/** Stored guardrails are organization or team rules; the table also shows agent and flow rules. */
export const GUARDRAIL_SCOPES = ['organization', 'team'] as const
export type GuardrailScope = (typeof GUARDRAIL_SCOPES)[number]
export const GUARD_TABLE_SCOPES = ['organization', 'team', 'agent', 'flow'] as const
export type GuardTableScope = (typeof GUARD_TABLE_SCOPES)[number]

export const guardrailNameSchema = z.string().trim().min(1).max(120)
export const guardReasonSchema = z.string().trim().min(1).max(1000)

// ── Definition (`Guardrail` v1) ─────────────────────────────────────────────────────────────────

export const GUARD_CONDITION_OPERATORS = ['gt', 'gte', 'lt', 'lte', 'eq', 'neq', 'in'] as const
export type GuardConditionOperator = (typeof GUARD_CONDITION_OPERATORS)[number]

/** A typed field of the action's input: `amount > 200`. */
export const guardConditionSchema = z.object({
  field: z
    .string()
    .regex(/^[a-zA-Z][a-zA-Z0-9_.]*$/)
    .max(100),
  operator: z.enum(GUARD_CONDITION_OPERATORS),
  value: z.union([
    z.number(),
    z.string().max(500),
    z.boolean(),
    z.array(z.union([z.string().max(500), z.number()])).max(50),
  ]),
})
export type GuardCondition = z.infer<typeof guardConditionSchema>

export const GUARD_CONDITIONS_MAX = 10

/** Which actions a rule applies to: a tool, bridge action or category (`payments.refund`), narrowed by conditions. */
export const guardMatchSchema = z.object({
  action: z.string().trim().min(1).max(200),
  conditions: z.array(guardConditionSchema).max(GUARD_CONDITIONS_MAX).optional(),
})
export type GuardMatch = z.infer<typeof guardMatchSchema>

/** Longest wait before the timeout action: 30 days. */
export const GUARD_WAIT_MINUTES_MAX = 43_200

const approvalRuleSchema = z
  .object({
    version: z.literal(1),
    kind: z.literal('approval_rule'),
    match: guardMatchSchema,
    approvers: z.array(approverSchema).min(1).max(APPROVERS_MAX),
    /** Null waits until decided or canceled. */
    waitMinutes: z.number().int().positive().max(GUARD_WAIT_MINUTES_MAX).nullable(),
    /** Required with `waitMinutes`, absent without it. */
    onTimeout: z.enum(APPROVAL_TIMEOUT_ACTIONS).nullable(),
    escalateTo: z.array(approverSchema).max(APPROVERS_MAX).default([]),
    risk: z.enum(APPROVAL_RISKS),
  })
  .refine((rule) => (rule.waitMinutes === null) === (rule.onTimeout === null))

const thresholdOverrideSchema = z
  .object({
    version: z.literal(1),
    kind: z.literal('threshold_override'),
    match: guardMatchSchema,
    /** Only values higher than the defaults take effect; lower ones are ignored by the merge. */
    autoBp: basisPointsSchema,
    reviewBp: basisPointsSchema,
  })
  .refine((rule) => rule.reviewBp <= rule.autoBp)

const blockedActionSchema = z.object({
  version: z.literal(1),
  kind: z.literal('blocked_action'),
  match: guardMatchSchema,
})

export const ACTION_LIMIT_REACHED_ACTIONS = ['block', 'require_approval'] as const
const actionLimitSchema = z.object({
  version: z.literal(1),
  kind: z.literal('action_limit'),
  match: guardMatchSchema,
  limit: z
    .object({
      perActionAmountMicros: z.number().int().positive().optional(),
      perDayCount: z.number().int().positive().optional(),
      perDayAmountMicros: z.number().int().positive().optional(),
    })
    .refine(
      (limit) =>
        limit.perActionAmountMicros !== undefined ||
        limit.perDayCount !== undefined ||
        limit.perDayAmountMicros !== undefined,
    ),
  onReached: z.enum(ACTION_LIMIT_REACHED_ACTIONS),
})

export const CONTENT_FILTER_ACTIONS = ['flag', 'block'] as const
const contentFilterSchema = z.object({
  version: z.literal(1),
  kind: z.literal('content_filter'),
  match: guardMatchSchema,
  categories: z
    .array(
      z
        .string()
        .regex(/^[a-z][a-z0-9_]*$/)
        .max(50),
    )
    .min(1)
    .max(20),
  action: z.enum(CONTENT_FILTER_ACTIONS),
})

/** One variant per guardrail type; `kind` equals the row's `type`. */
export const guardrailDefinitionSchema = z.discriminatedUnion('kind', [
  approvalRuleSchema,
  thresholdOverrideSchema,
  blockedActionSchema,
  actionLimitSchema,
  contentFilterSchema,
])
export type GuardrailDefinition = z.infer<typeof guardrailDefinitionSchema>

// ── DTOs ────────────────────────────────────────────────────────────────────────────────────────

export const guardrailDtoSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  type: z.enum(GUARDRAIL_TYPES),
  scope: z.enum(GUARDRAIL_SCOPES),
  team: teamRefDtoSchema.nullable(),
  definition: guardrailDefinitionSchema,
  isEnabled: z.boolean(),
  /** Locked by an Owner: only Owners change, disable or delete it. */
  isLocked: z.boolean(),
  lockedBy: userRefDtoSchema.nullable(),
  lockedReason: z.string().nullable(),
  /** An enabled blocked action with the same match already exists: "Another rule already blocks this action". */
  conflictsWith: z.object({ id: z.uuid(), name: z.string() }).nullable(),
  createdBy: userRefDtoSchema.nullable(),
  updatedBy: userRefDtoSchema.nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
})
export type GuardrailDto = z.infer<typeof guardrailDtoSchema>

export const guardrailParamsSchema = guardParamsSchema.extend({ guardrailId: z.uuid() })
export type GuardrailParams = z.infer<typeof guardrailParamsSchema>

/** Where a read-only row is edited: the agent's Guard tab, the flow, or Guard › Data filters. */
export const guardRuleEditTargetSchema = z.object({
  type: z.enum(['agent', 'flow', 'data_filters']),
  id: z.uuid().nullable(),
})
export type GuardRuleEditTarget = z.infer<typeof guardRuleEditTargetSchema>

/**
 * A row of the Guardrails table: a stored guardrail, an agent or flow rule, or a data filter.
 * `editTarget` is set when the row is read-only here.
 */
export const guardRuleRowDtoSchema = z.object({
  /** The guardrail id, the agent or flow id, or the personal-data rule id. */
  id: z.uuid(),
  /** The rule id inside an agent or flow definition; null for stored rules. */
  ruleKey: z.string().nullable(),
  name: z.string(),
  type: z.enum(GUARD_TABLE_TYPES),
  scope: z.enum(GUARD_TABLE_SCOPES),
  team: teamRefDtoSchema.nullable(),
  /** Agents and flows the rule applies to. */
  usedByCount: z.number().int().nonnegative(),
  /** Audit entries `guard.rule_triggered` in the last 7 days. */
  triggeredThisWeek: z.number().int().nonnegative(),
  isEnabled: z.boolean(),
  isLocked: z.boolean(),
  lockedBy: userRefDtoSchema.nullable(),
  lockedReason: z.string().nullable(),
  editTarget: guardRuleEditTargetSchema.nullable(),
})
export type GuardRuleRowDto = z.infer<typeof guardRuleRowDtoSchema>

export const GUARDRAIL_SORT_FIELDS = ['name', 'createdAt', 'triggeredThisWeek'] as const

export const listGuardrailsQuerySchema = pageQuery.extend({
  q: searchQuery,
  type: multiValueQuery(z.enum(GUARD_TABLE_TYPES)),
  scope: multiValueQuery(z.enum(GUARD_TABLE_SCOPES)),
  teamId: z.uuid().optional(),
  isEnabled: z.stringbool().optional(),
  sort: sortQuery(GUARDRAIL_SORT_FIELDS),
})
export type ListGuardrailsQuery = z.infer<typeof listGuardrailsQuerySchema>

// ── Inputs ──────────────────────────────────────────────────────────────────────────────────────

const hasConsistentTeam = (target: { scope: string; teamId?: string }) =>
  (target.scope === 'team') === (target.teamId !== undefined)

/** `POST …/guardrails`: the type comes from `definition.kind`. */
export const createGuardrailInputSchema = z
  .object({
    name: guardrailNameSchema,
    scope: z.enum(GUARDRAIL_SCOPES),
    teamId: z.uuid().optional(),
    definition: guardrailDefinitionSchema,
    isEnabled: z.boolean().default(true),
  })
  .refine(hasConsistentTeam)
export type CreateGuardrailInput = z.infer<typeof createGuardrailInputSchema>

/**
 * `PATCH …/:guardrailId`: the type and scope are fixed (a new `definition` must keep its `kind`;
 * GUARD_RULE_TYPE_IMMUTABLE otherwise). `reason` is required when the change turns the rule off or
 * loosens it.
 */
export const updateGuardrailInputSchema = z
  .object({
    name: guardrailNameSchema,
    definition: guardrailDefinitionSchema,
    isEnabled: z.boolean(),
    reason: guardReasonSchema,
  })
  .partial()
export type UpdateGuardrailInput = z.infer<typeof updateGuardrailInputSchema>

/** `DELETE …/:guardrailId?reason=`. */
export const deleteGuardrailQuerySchema = z.object({ reason: guardReasonSchema.optional() })
export type DeleteGuardrailQuery = z.infer<typeof deleteGuardrailQuerySchema>

/** `POST …/:guardrailId/lock`: shown next to the lock. */
export const lockGuardrailInputSchema = z.object({ reason: guardReasonSchema })
export type LockGuardrailInput = z.infer<typeof lockGuardrailInputSchema>

/**
 * What depends on a guardrail (from `dependency_edges`): the agents and flows it applies to
 * ("Affects 3 agents"). Counts cover all of them; names are capped.
 */
export const guardrailImpactDtoSchema = z.object({
  dependents: z.array(z.object({ type: z.string(), count: z.number().int().nonnegative() })),
  listed: z
    .array(z.object({ type: z.string(), id: z.uuid(), name: z.string() }))
    .max(IMPACT_LISTED_MAX),
})
export type GuardrailImpactDto = z.infer<typeof guardrailImpactDtoSchema>
