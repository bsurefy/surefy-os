// SPDX-License-Identifier: AGPL-3.0-only
import { z } from 'zod'

import { userRefDtoSchema } from '../auth/schemas.js'
import { multiValueQuery, searchQuery } from '../core/filters.js'
import { pageQuery } from '../core/pagination.js'
import { orgParamsSchema } from '../core/params.js'
import { currencySchema } from '../organizations/schemas.js'
import { teamRefDtoSchema } from '../teams/schemas.js'

// AI cost budgets (database/usage-budgets-and-audit.md §2–3, "Who is charged", "Live budget
// enforcement"; Settings › Usage & budgets, the single home of budgets). Routes, all under
// /api/v1/orgs/:orgId/budgets (`budgets:read` to read, `budgets:manage` to write):
// GET / · POST / · PATCH /:budgetId · DELETE /:budgetId.
// A call made for a person counts against their personal limit, their primary team's budget and
// the organization budget; calls without a person count against the organization budget only.
// Every write audits `budget.*` with the before/after diff and emits `budgets.changed`.

/** One budget per scope: the organization, a team, or one person (a personal limit). */
export const BUDGET_SCOPES = ['organization', 'team', 'user'] as const
export type BudgetScope = (typeof BUDGET_SCOPES)[number]

/** A UTC calendar month; the only period. */
export const BUDGET_PERIODS = ['month'] as const
export type BudgetPeriod = (typeof BUDGET_PERIODS)[number]

/**
 * What happens when a budget is reached, weakest first. When several reached budgets apply to one
 * call, the strictest wins (`strictestBudgetAction`). Local models are never stopped.
 * - `notify_only`: the call proceeds; the alerts still fire.
 * - `switch_to_local`: the gateway uses the first allowed local model in the Vault fallback order
 *   and records the switch; without one, `BUDGET_EXCEEDED`.
 * - `pause_cloud_models`: cloud models are refused with `BUDGET_EXCEEDED` until the next month.
 */
export const BUDGET_ON_REACHED_ACTIONS = [
  'notify_only',
  'switch_to_local',
  'pause_cloud_models',
] as const
export type BudgetOnReachedAction = (typeof BUDGET_ON_REACHED_ACTIONS)[number]

/** The strictest action of the reached budgets; null when none was reached. */
export function strictestBudgetAction(
  actions: readonly BudgetOnReachedAction[],
): BudgetOnReachedAction | null {
  let strictest: BudgetOnReachedAction | null = null
  for (const action of actions)
    if (
      strictest === null ||
      BUDGET_ON_REACHED_ACTIONS.indexOf(action) > BUDGET_ON_REACHED_ACTIONS.indexOf(strictest)
    )
      strictest = action
  return strictest
}

/** Alerts at 50, 80 and 100 percent, as basis points (8000 = 80%). */
export const BUDGET_DEFAULT_ALERT_THRESHOLDS_BP = [5000, 8000, 10_000] as const
export const BUDGET_ALERT_THRESHOLDS_MAX = 5

/** Distinct thresholds between 1 and 10000 basis points, returned in ascending order. */
export const budgetAlertThresholdsSchema = z
  .array(z.number().int().min(1).max(10_000))
  .max(BUDGET_ALERT_THRESHOLDS_MAX)
  .refine((thresholds) => new Set(thresholds).size === thresholds.length, {
    message: 'Each alert threshold appears once',
  })
  .transform((thresholds) => [...thresholds].sort((a, b) => a - b))

/** Integer micros of the organization currency. */
export const budgetAmountMicrosSchema = z.number().int().nonnegative()

export const budgetParamsSchema = orgParamsSchema.extend({ budgetId: z.uuid() })
export type BudgetParams = z.infer<typeof budgetParamsSchema>

/** Who the budget is for; fixed once created. */
export const budgetTargetSchema = z.discriminatedUnion('scope', [
  z.object({ scope: z.literal('organization') }),
  z.object({ scope: z.literal('team'), teamId: z.uuid() }),
  z.object({ scope: z.literal('user'), userId: z.uuid() }),
])
export type BudgetTarget = z.infer<typeof budgetTargetSchema>

const budgetSettingsSchema = z.object({
  amountMicros: budgetAmountMicrosSchema,
  onReached: z.enum(BUDGET_ON_REACHED_ACTIONS).default('notify_only'),
  alertThresholdsBp: budgetAlertThresholdsSchema.default([...BUDGET_DEFAULT_ALERT_THRESHOLDS_BP]),
  isEnabled: z.boolean().default(true),
})

/**
 * `POST /budgets`. The currency is the organization's. A second budget for the same scope fails
 * with `BUDGET_ALREADY_EXISTS`; a team or personal budget above the enabled organization budget
 * fails with `ACCESS_EXCEEDS_PARENT` (field `amountMicros`, the organization amount as the parent
 * value).
 */
export const createBudgetInputSchema = z.intersection(budgetTargetSchema, budgetSettingsSchema)
export type CreateBudgetInput = z.infer<typeof createBudgetInputSchema>

/**
 * `PATCH /budgets/:budgetId`. Lowering the amount below this month's spend is T2: the client shows
 * the spend from the DTO ("Support has used $430; cloud models stop for Support until next
 * month"). Lowering the organization budget never rewrites team or personal budgets; their
 * effective amount becomes the minimum.
 */
export const updateBudgetInputSchema = z
  .object({
    amountMicros: budgetAmountMicrosSchema,
    onReached: z.enum(BUDGET_ON_REACHED_ACTIONS),
    alertThresholdsBp: budgetAlertThresholdsSchema,
    isEnabled: z.boolean(),
  })
  .partial()
  .refine((input) => Object.keys(input).length > 0, {
    message: 'Change at least one field',
  })
export type UpdateBudgetInput = z.infer<typeof updateBudgetInputSchema>

/** `GET /budgets`: the organization budget first, then teams by name, then people by name. */
export const listBudgetsQuerySchema = pageQuery.extend({
  scope: multiValueQuery(z.enum(BUDGET_SCOPES)),
  teamId: z.uuid().optional(),
  userId: z.uuid().optional(),
  /** Matches the team name, the person's name and email. */
  q: searchQuery,
})
export type ListBudgetsQuery = z.infer<typeof listBudgetsQuerySchema>

/** Meter colors: `warning` from the warning threshold, `reached` at 100% of the effective amount. */
export const BUDGET_METER_STATES = ['ok', 'warning', 'reached'] as const
export type BudgetMeterState = (typeof BUDGET_METER_STATES)[number]

/** The warning threshold when a budget has no alert threshold below 100%. */
export const BUDGET_METER_WARNING_BP = 8000

/** Spend as basis points of the amount; a zero amount counts as reached. */
export function budgetUsedBp(spentMicros: number, amountMicros: number): number {
  if (amountMicros === 0) return 10_000
  return Math.floor((spentMicros * 10_000) / amountMicros)
}

/** The highest alert threshold below 100% turns the meter to warning; 80% without one. */
export function budgetMeterState(
  spentMicros: number,
  amountMicros: number,
  alertThresholdsBp: readonly number[] = BUDGET_DEFAULT_ALERT_THRESHOLDS_BP,
): BudgetMeterState {
  const usedBp = budgetUsedBp(spentMicros, amountMicros)
  if (spentMicros >= amountMicros) return 'reached'
  const below = alertThresholdsBp.filter((bp) => bp < 10_000)
  const warningBp = below.length > 0 ? Math.max(...below) : BUDGET_METER_WARNING_BP
  return usedBp >= warningBp ? 'warning' : 'ok'
}

/** The current month's spend against a budget, for the Settings rows and the Insights meter. */
export const budgetMeterDtoSchema = z.object({
  budgetId: z.uuid(),
  scope: z.enum(BUDGET_SCOPES),
  /** The budget's own amount. */
  amountMicros: budgetAmountMicrosSchema,
  /** The amount that applies: the minimum of this budget and the enabled organization budget. */
  effectiveAmountMicros: budgetAmountMicrosSchema,
  /** Spend this month in the budget currency (live counter, else `usage_monthly`). */
  spentMicros: z.number().int().nonnegative(),
  currency: currencySchema,
  /** Of the effective amount; above 10000 once overshot by calls already in flight. */
  usedBp: z.number().int().nonnegative(),
  state: z.enum(BUDGET_METER_STATES),
  onReached: z.enum(BUDGET_ON_REACHED_ACTIONS),
  periodStart: z.iso.date(),
  /** Exclusive: the first day of the next UTC month, when the budget starts again. */
  periodEnd: z.iso.date(),
})
export type BudgetMeterDto = z.infer<typeof budgetMeterDtoSchema>

export const budgetDtoSchema = z.object({
  id: z.uuid(),
  scope: z.enum(BUDGET_SCOPES),
  /** Team budgets; null for the other scopes or a team that no longer resolves. */
  team: teamRefDtoSchema.nullable(),
  /** Personal limits; null for the other scopes. */
  user: userRefDtoSchema.nullable(),
  /** Personal limits: the team the person is charged to, null without one ("Who is charged"). */
  primaryTeam: teamRefDtoSchema.nullable(),
  period: z.enum(BUDGET_PERIODS),
  amountMicros: budgetAmountMicrosSchema,
  currency: currencySchema,
  onReached: z.enum(BUDGET_ON_REACHED_ACTIONS),
  alertThresholdsBp: z.array(z.number().int().min(1).max(10_000)),
  isEnabled: z.boolean(),
  /** This month; null while the budget is disabled. */
  meter: budgetMeterDtoSchema.nullable(),
  /** The highest threshold crossed this month, null before the first alert. */
  lastAlert: z.object({ thresholdBp: z.number().int(), triggeredAt: z.iso.datetime() }).nullable(),
  updatedBy: userRefDtoSchema.nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
})
export type BudgetDto = z.infer<typeof budgetDtoSchema>

/**
 * `details[]` of `BUDGET_EXCEEDED` (429): the budget that stopped the call. The chat card and the
 * run error explain what still works (local models) and who can change it.
 */
export const budgetExceededDetailSchema = z.object({
  scope: z.enum(BUDGET_SCOPES),
  amountMicros: budgetAmountMicrosSchema,
  currency: currencySchema,
  /** Exclusive; cloud models work again from this day. */
  periodEnd: z.iso.date(),
})
export type BudgetExceededDetail = z.infer<typeof budgetExceededDetailSchema>

/**
 * `NotificationParams` of `budget.threshold_reached` (target type `budget`): sent to Admins and
 * Owners, the team lead for a team budget, and the person for a personal limit.
 */
export const budgetThresholdReachedParamsSchema = z.object({
  version: z.literal(1),
  scope: z.enum(BUDGET_SCOPES),
  /** The team or person name at the time of the alert; null for the organization. */
  scopeLabel: z.string().nullable(),
  thresholdBp: z.number().int().min(1).max(10_000),
  spentMicros: z.number().int().nonnegative(),
  amountMicros: budgetAmountMicrosSchema,
  currency: currencySchema,
  onReached: z.enum(BUDGET_ON_REACHED_ACTIONS),
  periodStart: z.iso.date(),
})
export type BudgetThresholdReachedParams = z.infer<typeof budgetThresholdReachedParamsSchema>
