// SPDX-License-Identifier: AGPL-3.0-only
import { z } from 'zod'

import { guardReasonSchema } from './guardrails.js'
import { guardParamsSchema } from './thresholds.js'
import { userRefDtoSchema } from '../auth/schemas.js'
import { teamRefDtoSchema } from '../teams/schemas.js'

// The personal-data filter applied before data leaves for a cloud model or search provider
// (database/guard-and-approvals.md §3; Guard › Data filters). Routes, under
// /api/v1/orgs/:orgId/guard:
// GET /data-filters · POST /data-filters/test ·
// POST /pii-rules · PATCH/DELETE /pii-rules/:ruleId.
// Local models skip the filter by policy. Loosening a type or adding an exception is T2 with a
// reason (GUARD_REASON_REQUIRED). Only Admins and Owners write; agent definitions cannot loosen it.

export const BUILT_IN_PII_TYPES = [
  'person_name',
  'email',
  'phone',
  'payment_card',
  'bank_account',
  'government_id',
  'address',
] as const
export type BuiltInPiiType = (typeof BUILT_IN_PII_TYPES)[number]

export const PII_TYPES = [...BUILT_IN_PII_TYPES, 'custom'] as const
export type PiiType = (typeof PII_TYPES)[number]

/** From the loosest to the strictest: detect only, replace with a placeholder, stop the request. */
export const PII_ACTIONS = ['detect', 'mask', 'block'] as const
export type PiiAction = (typeof PII_ACTIONS)[number]

/** What a built-in type does until an organization row says otherwise. */
export const PII_FILTER_DEFAULTS = {
  person_name: 'detect',
  email: 'mask',
  phone: 'mask',
  payment_card: 'block',
  bank_account: 'block',
  government_id: 'block',
  address: 'mask',
} as const satisfies Record<BuiltInPiiType, PiiAction>

export const PII_SCOPES = ['organization', 'team', 'agent'] as const
export type PiiScope = (typeof PII_SCOPES)[number]

const strictness = (action: PiiAction) => PII_ACTIONS.indexOf(action)

/** `block → mask → detect` is looser: it needs a reason. */
export function piiActionLoosened(before: PiiAction, after: PiiAction): boolean {
  return strictness(after) < strictness(before)
}

/** Among several team rows the strictest wins. */
export function strictestPiiAction(actions: readonly [PiiAction, ...PiiAction[]]): PiiAction {
  return actions.reduce((strictest, action) =>
    strictness(action) > strictness(strictest) ? action : strictest,
  )
}

/** Longest custom pattern; the service also checks that it compiles and cannot backtrack catastrophically. */
export const PII_PATTERN_MAX_LENGTH = 500
export const PII_CUSTOM_LABEL_MAX_LENGTH = 100

export const customPiiLabelSchema = z.string().trim().min(1).max(PII_CUSTOM_LABEL_MAX_LENGTH)
export const customPiiPatternSchema = z.string().min(1).max(PII_PATTERN_MAX_LENGTH)

/** One stored rule: an organization row, or a team or agent exception. */
export const piiRuleDtoSchema = z.object({
  id: z.uuid(),
  piiType: z.enum(PII_TYPES),
  customLabel: z.string().nullable(),
  customPattern: z.string().nullable(),
  action: z.enum(PII_ACTIONS),
  scope: z.enum(PII_SCOPES),
  team: teamRefDtoSchema.nullable(),
  agent: z.object({ id: z.uuid(), name: z.string() }).nullable(),
  createdBy: userRefDtoSchema.nullable(),
  updatedBy: userRefDtoSchema.nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
})
export type PiiRuleDto = z.infer<typeof piiRuleDtoSchema>

export const piiRuleParamsSchema = guardParamsSchema.extend({ ruleId: z.uuid() })
export type PiiRuleParams = z.infer<typeof piiRuleParamsSchema>

/**
 * One line of Guard › Data filters: a type with its organization-wide action and its exceptions.
 * Built-in types always appear; `source` says whether the action is the code default or a row.
 * `ruleId` and `customPattern` are set for custom types and for rows the organization saved.
 */
export const dataFilterTypeDtoSchema = z.object({
  piiType: z.enum(PII_TYPES),
  customLabel: z.string().nullable(),
  customPattern: z.string().nullable(),
  action: z.enum(PII_ACTIONS),
  source: z.enum(['default', 'organization']),
  ruleId: z.uuid().nullable(),
  exceptions: z.array(piiRuleDtoSchema),
})
export type DataFilterTypeDto = z.infer<typeof dataFilterTypeDtoSchema>

export const dataFiltersDtoSchema = z.object({ items: z.array(dataFilterTypeDtoSchema) })
export type DataFiltersDto = z.infer<typeof dataFiltersDtoSchema>

const piiRuleTargetShape = {
  scope: z.enum(PII_SCOPES),
  teamId: z.uuid().optional(),
  agentId: z.uuid().optional(),
} as const

interface PiiTarget {
  scope: string
  teamId?: string
  agentId?: string
}

/** A team row has a team, an agent row an agent, an organization row neither. */
const hasConsistentPiiTarget = (target: PiiTarget) =>
  (target.scope === 'team') === (target.teamId !== undefined) &&
  (target.scope === 'agent') === (target.agentId !== undefined)

/** A custom type carries a label and a pattern; a built-in type carries neither. */
const hasConsistentCustom = (rule: {
  piiType: string
  customLabel?: string
  customPattern?: string
}) =>
  rule.piiType === 'custom'
    ? rule.customLabel !== undefined && rule.customPattern !== undefined
    : rule.customLabel === undefined && rule.customPattern === undefined

/**
 * `POST …/pii-rules`: the organization's action for a type, or a team or agent exception. A type
 * with a rule in this scope is changed with PATCH (GUARD_PII_RULE_DUPLICATE otherwise).
 */
export const createPiiRuleInputSchema = z
  .object({
    piiType: z.enum(PII_TYPES),
    customLabel: customPiiLabelSchema.optional(),
    customPattern: customPiiPatternSchema.optional(),
    action: z.enum(PII_ACTIONS),
    ...piiRuleTargetShape,
    reason: guardReasonSchema.optional(),
  })
  .refine(hasConsistentPiiTarget)
  .refine(hasConsistentCustom)
export type CreatePiiRuleInput = z.infer<typeof createPiiRuleInputSchema>

/** `PATCH …/pii-rules/:ruleId`: the action, and a custom type's label and pattern. */
export const updatePiiRuleInputSchema = z
  .object({
    action: z.enum(PII_ACTIONS),
    customLabel: customPiiLabelSchema,
    customPattern: customPiiPatternSchema,
    reason: guardReasonSchema,
  })
  .partial()
export type UpdatePiiRuleInput = z.infer<typeof updatePiiRuleInputSchema>

/** `DELETE …/pii-rules/:ruleId?reason=`: falls back to the next level (an exception goes, the organization row stays). */
export const deletePiiRuleQuerySchema = z.object({ reason: guardReasonSchema.optional() })
export type DeletePiiRuleQuery = z.infer<typeof deletePiiRuleQuerySchema>

export const PII_TEST_TEXT_MAX_LENGTH = 10_000

/** `POST …/data-filters/test`: "Try it" with the organization's rules, or as a team or agent would see them. */
export const testDataFilterInputSchema = z
  .object({
    text: z.string().min(1).max(PII_TEST_TEXT_MAX_LENGTH),
    teamId: z.uuid().optional(),
    agentId: z.uuid().optional(),
    /** A pattern being edited, tried before it is saved. */
    customPattern: customPiiPatternSchema.optional(),
    customLabel: customPiiLabelSchema.optional(),
  })
  .refine((input) => (input.customPattern === undefined) === (input.customLabel === undefined))
export type TestDataFilterInput = z.infer<typeof testDataFilterInputSchema>

export const dataFilterFindingDtoSchema = z.object({
  piiType: z.enum(PII_TYPES),
  customLabel: z.string().nullable(),
  action: z.enum(PII_ACTIONS),
  count: z.number().int().positive(),
})
export type DataFilterFindingDto = z.infer<typeof dataFilterFindingDtoSchema>

/** The masked text and the types found; `blocked` means a `block` type matched and a real request would stop. */
export const testDataFilterResultDtoSchema = z.object({
  maskedText: z.string(),
  blocked: z.boolean(),
  findings: z.array(dataFilterFindingDtoSchema),
})
export type TestDataFilterResultDto = z.infer<typeof testDataFilterResultDtoSchema>
