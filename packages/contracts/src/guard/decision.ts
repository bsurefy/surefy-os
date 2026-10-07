// SPDX-License-Identifier: AGPL-3.0-only
import { z } from 'zod'

import { GUARD_BANDS, basisPointsSchema } from './thresholds.js'

// Decisions with confidence (ai-architecture.md §5, backend/integrations.md "Decision mode"): the
// shape `modelGateway.decide` returns whichever implementation answers, and the verdict Guard
// records for each checked step. Agent runs, flows and the routing classifier all reuse them.

export const DECISION_OPTIONS_MAX = 20

/** What is asked: a question and, optionally, the allowed answers (yes/no, pick one, score). */
export const decisionRequestSchema = z.object({
  question: z.string().trim().min(1).max(2000),
  /** Allowed answers; absent means a free decision the caller's schema constrains. */
  options: z.array(z.string().min(1).max(200)).min(2).max(DECISION_OPTIONS_MAX).optional(),
  input: z.string().max(100_000),
})
export type DecisionRequest = z.infer<typeof decisionRequestSchema>

/** `{ value: 'billing', confidence: 0.88, reasoning: '…' }`: confidence is 0 to 1. */
export const decisionResultSchema = z.object({
  value: z.union([z.string(), z.number(), z.boolean()]),
  confidence: z.number().min(0).max(1),
  reasoning: z.string().max(4000),
})
export type DecisionResult = z.infer<typeof decisionResultSchema>

/** The second check of the `double_check` band: another model reviews the proposed action. */
export const doubleCheckResultSchema = z.object({
  agreed: z.boolean(),
  confidence: z.number().min(0).max(1),
  reasoning: z.string().max(4000),
})
export type DoubleCheckResult = z.infer<typeof doubleCheckResultSchema>

/** `blocked` is a blocked-action rule or a reached limit; the rest are the confidence bands. */
export const GUARD_OUTCOMES = [...GUARD_BANDS, 'blocked'] as const
export type GuardOutcome = (typeof GUARD_OUTCOMES)[number]

/** A rule that took part in a check; `ref` is a guardrail id or `agent:{id}:v{n}:{ruleId}` / `flow:…`. */
export const guardRuleMatchSchema = z.object({
  ref: z.string().min(1).max(300),
  type: z.enum([
    'approval_rule',
    'threshold_override',
    'blocked_action',
    'action_limit',
    'content_filter',
  ]),
})
export type GuardRuleMatch = z.infer<typeof guardRuleMatchSchema>

/**
 * What Guard decided for one action, recorded with the run step and shown in the run timeline
 * ("Guard checks"). `approvalId` is set when the outcome needs a person (an approval rule matched,
 * the band is `human`, or a double check disagreed).
 */
export const guardCheckResultSchema = z.object({
  outcome: z.enum(GUARD_OUTCOMES),
  /** Null when the action has no confidence (a rule decided on its own). */
  confidence: z.number().min(0).max(1).nullable(),
  /** The effective thresholds after merging organization, team, agent and flow values. */
  thresholds: z.object({ autoBp: basisPointsSchema, reviewBp: basisPointsSchema }),
  matchedRules: z.array(guardRuleMatchSchema).max(50),
  doubleCheck: doubleCheckResultSchema.nullable(),
  approvalId: z.uuid().nullable(),
  /** `GUARD_BLOCKED_ACTION` or `GUARD_ACTION_LIMIT` when the outcome is `blocked`. */
  reasonCode: z.enum(['GUARD_BLOCKED_ACTION', 'GUARD_ACTION_LIMIT']).nullable(),
})
export type GuardCheckResult = z.infer<typeof guardCheckResultSchema>
