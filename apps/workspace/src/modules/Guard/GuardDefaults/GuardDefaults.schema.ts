// SPDX-License-Identifier: AGPL-3.0-only
import { z } from 'zod'

import { GUARD_QUICK_APPROVE_RISKS } from '@surefy/contracts'

import { MINUTES_PER_UNIT, TARGET_MAX_MINUTES, TARGET_UNITS } from './GuardDefaults.constants'

/** What the form says when a value is not acceptable; translated by the caller. */
export interface GuardDefaultsFormMessages {
  thresholds: string
  stepUp: string
  target: string
}

/**
 * The defaults form. Thresholds are whole percents; the double-check threshold stays below the
 * automatic one. Amounts are in the organization's currency; the step-up amount only counts when
 * its switch is on; the target time is a value and a unit that fit the year the contract allows.
 */
export function createGuardDefaultsSchema(messages: GuardDefaultsFormMessages) {
  return z
    .object({
      autoPercent: z.number().int().min(1).max(100),
      reviewPercent: z.number().int().min(0).max(99),
      quickApproveAmount: z.number().min(0),
      quickApproveRisk: z.enum(GUARD_QUICK_APPROVE_RISKS),
      stepUpEnabled: z.boolean(),
      stepUpAmount: z.number().min(0).nullable(),
      targetValue: z.number().int().positive().nullable(),
      targetUnit: z.enum(TARGET_UNITS),
    })
    .refine((values) => values.reviewPercent < values.autoPercent, {
      path: ['reviewPercent'],
      message: messages.thresholds,
    })
    .refine((values) => !values.stepUpEnabled || values.stepUpAmount !== null, {
      path: ['stepUpAmount'],
      message: messages.stepUp,
    })
    .refine(
      (values) =>
        values.targetValue !== null &&
        values.targetValue * MINUTES_PER_UNIT[values.targetUnit] <= TARGET_MAX_MINUTES,
      { path: ['targetValue'], message: messages.target },
    )
}
type GuardDefaultsSchema = ReturnType<typeof createGuardDefaultsSchema>
export type GuardDefaultsValues = z.input<GuardDefaultsSchema>
export type GuardDefaultsOutput = z.output<GuardDefaultsSchema>
