// SPDX-License-Identifier: AGPL-3.0-only
import { z } from 'zod'

import { userRefDtoSchema } from '../auth/schemas.js'
import { orgParamsSchema } from '../core/params.js'

import type { APPROVAL_RISKS } from '../approvals/schemas.js'

// The organization's Guard defaults and the confidence rule (database/guard-and-approvals.md §1,
// "How rules merge"; Guard › Defaults). Routes, under /api/v1/orgs/:orgId/guard:
// GET/PUT /defaults · GET /defaults/impact.
// Saving defaults is T2 ("Applies to all agents and flows that use defaults"); loosening needs a
// reason for the audit entry `guard.defaults_changed`.

export const guardParamsSchema = orgParamsSchema
export type GuardParams = z.infer<typeof guardParamsSchema>

/** Confidence and thresholds travel as basis points (9000 = 90%). */
export const basisPointsSchema = z.number().int().min(0).max(10_000)

/**
 * What a confidence leads to: `auto` runs, `double_check` gets a second AI check, `human` creates
 * an approval. A matching blocked-action rule or limit stops the step before any band applies.
 */
export const GUARD_BANDS = ['auto', 'double_check', 'human'] as const
export type GuardBand = (typeof GUARD_BANDS)[number]

export interface GuardThresholds {
  readonly autoBp: number
  readonly reviewBp: number
}

/** `c >= auto` → auto; `review <= c < auto` → double_check; `c < review` → human. `confidence` is 0 to 1. */
export function guardBand(confidence: number, thresholds: GuardThresholds): GuardBand {
  const bp = Math.round(confidence * 10_000)
  if (bp >= thresholds.autoBp) return 'auto'
  if (bp >= thresholds.reviewBp) return 'double_check'
  return 'human'
}

/**
 * Stricter, never looser: the effective thresholds are the highest of the organization default,
 * every matching override and the agent or flow value. When that leaves `review` at or above
 * `auto`, `review` becomes `auto` and everything below `auto` goes to a person.
 */
export function mergeGuardThresholds(
  levels: readonly [GuardThresholds, ...GuardThresholds[]],
): GuardThresholds {
  const autoBp = Math.max(...levels.map((level) => level.autoBp))
  const reviewBp = Math.min(Math.max(...levels.map((level) => level.reviewBp)), autoBp)
  return { autoBp, reviewBp }
}

export const GUARD_QUICK_APPROVE_RISKS = [
  'low',
  'medium',
] as const satisfies readonly (typeof APPROVAL_RISKS)[number][]
export type GuardQuickApproveRisk = (typeof GUARD_QUICK_APPROVE_RISKS)[number]

/** What an organization has until it saves its own values (a missing row means these). */
export const GUARD_DEFAULTS = {
  autoThresholdBp: 9000,
  reviewThresholdBp: 6000,
  quickApproveMaxAmountMicros: 0,
  quickApproveMaxRisk: 'low',
  stepUpAmountMicros: null,
  targetDecisionMinutes: 60,
} as const

const microsSchema = z.number().int().nonnegative()

const guardSettingsShape = {
  autoThresholdBp: basisPointsSchema,
  reviewThresholdBp: basisPointsSchema,
  /** Largest amount the top-bar popover and bulk approve may decide; 0 means no money. */
  quickApproveMaxAmountMicros: microsSchema,
  quickApproveMaxRisk: z.enum(GUARD_QUICK_APPROVE_RISKS),
  /** Approvals above this amount need re-authentication; null means never. */
  stepUpAmountMicros: microsSchema.nullable(),
  /** Age after which the queue shows a warning. */
  targetDecisionMinutes: z.number().int().positive().max(525_600),
} as const

const hasOrderedThresholds = (settings: { autoThresholdBp: number; reviewThresholdBp: number }) =>
  settings.reviewThresholdBp < settings.autoThresholdBp

/** The three amounts are in `currency`, which is the organization's. */
export const guardSettingsDtoSchema = z
  .object({
    ...guardSettingsShape,
    currency: z.string().length(3),
    /** False while the organization has not saved values of its own. */
    isCustomized: z.boolean(),
    updatedBy: userRefDtoSchema.nullable(),
    updatedAt: z.iso.datetime().nullable(),
  })
  .refine(hasOrderedThresholds)
export type GuardSettingsDto = z.infer<typeof guardSettingsDtoSchema>

/** `PUT …/defaults`: all values at once. `reason` is required when the change loosens anything. */
export const updateGuardSettingsInputSchema = z
  .object({ ...guardSettingsShape, reason: z.string().trim().min(1).max(1000).optional() })
  .refine(hasOrderedThresholds)
export type UpdateGuardSettingsInput = z.infer<typeof updateGuardSettingsInputSchema>

type GuardValues = z.infer<z.ZodObject<typeof guardSettingsShape>>

/**
 * Lowering a threshold, raising the quick-approve amount or risk, raising the step-up amount or
 * clearing it all loosen Guard: the dialog then asks for a reason.
 */
export function guardDefaultsLoosened(before: GuardValues, after: GuardValues): boolean {
  const stepUpLoosened =
    before.stepUpAmountMicros !== null &&
    (after.stepUpAmountMicros === null || after.stepUpAmountMicros > before.stepUpAmountMicros)
  return (
    after.autoThresholdBp < before.autoThresholdBp ||
    after.reviewThresholdBp < before.reviewThresholdBp ||
    after.quickApproveMaxAmountMicros > before.quickApproveMaxAmountMicros ||
    (before.quickApproveMaxRisk === 'low' && after.quickApproveMaxRisk === 'medium') ||
    stepUpLoosened
  )
}

/** Guard-checked steps the impact preview looks back over. */
export const GUARD_IMPACT_SAMPLE_SIZE = 1000

/** `GET …/defaults/impact`: the proposed thresholds, banded over the recent steps. */
export const guardImpactPreviewQuerySchema = z
  .object({
    autoThresholdBp: z.coerce.number().pipe(basisPointsSchema),
    reviewThresholdBp: z.coerce.number().pipe(basisPointsSchema),
  })
  .refine(hasOrderedThresholds)
export type GuardImpactPreviewQuery = z.infer<typeof guardImpactPreviewQuerySchema>

/** "With these values, 412 of the last 1,000 actions would have needed a person." */
export const guardImpactPreviewDtoSchema = z.object({
  sampleSize: z.number().int().nonnegative().max(GUARD_IMPACT_SAMPLE_SIZE),
  auto: z.number().int().nonnegative(),
  doubleCheck: z.number().int().nonnegative(),
  human: z.number().int().nonnegative(),
})
export type GuardImpactPreviewDto = z.infer<typeof guardImpactPreviewDtoSchema>
