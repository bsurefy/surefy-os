// SPDX-License-Identifier: AGPL-3.0-only
import { z } from 'zod'

// Guard › Overview (database/guard-and-approvals.md "Queries and access paths"; rollups from
// `guard_stats_daily`). Route, under /api/v1/orgs/:orgId/guard: GET /overview.
// It links to the approvals queue and never shows a second approvals list.

export const GUARD_OVERVIEW_RANGES = ['7d', '30d'] as const
export type GuardOverviewRange = (typeof GUARD_OVERVIEW_RANGES)[number]

export const guardOverviewQuerySchema = z.object({
  range: z.enum(GUARD_OVERVIEW_RANGES).default('7d'),
})
export type GuardOverviewQuery = z.infer<typeof guardOverviewQuerySchema>

/** What "Needs your attention" lists; each links to the queue or to the rule. */
export const GUARD_ATTENTION_KINDS = [
  'approvals_overdue',
  'guardrail_conflict',
  'agent_thresholds_outdated',
] as const
export type GuardAttentionKind = (typeof GUARD_ATTENTION_KINDS)[number]

export const guardAttentionItemDtoSchema = z.object({
  kind: z.enum(GUARD_ATTENTION_KINDS),
  count: z.number().int().positive(),
  /** The queue (`approvals`, no id), a guardrail, or an agent. */
  target: z.object({ type: z.enum(['approvals', 'guardrail', 'agent']), id: z.uuid().nullable() }),
})
export type GuardAttentionItemDto = z.infer<typeof guardAttentionItemDtoSchema>

const countSchema = z.number().int().nonnegative()

/** How actions were checked in the range, and what Guard stopped. */
export const guardOverviewDtoSchema = z.object({
  range: z.enum(GUARD_OVERVIEW_RANGES),
  /** Checked actions by what they led to. */
  auto: countSchema,
  doubleChecked: countSchema,
  needsPerson: countSchema,
  blockedByLimits: countSchema,
  /** Requests where masking or blocking hid personal data. */
  personalDataHidden: countSchema,
  /** Calls served by local models: the data filter does not apply. */
  ranOnLocalModels: countSchema,
  /** Median time from request to a person's decision; null when nobody decided. */
  medianMinutesToApprove: z.number().nonnegative().nullable(),
  attention: z.array(guardAttentionItemDtoSchema).max(20),
})
export type GuardOverviewDto = z.infer<typeof guardOverviewDtoSchema>
