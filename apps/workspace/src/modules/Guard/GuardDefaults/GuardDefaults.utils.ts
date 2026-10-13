// SPDX-License-Identifier: AGPL-3.0-only
import { guardDefaultsLoosened } from '@surefy/contracts'
import type { GuardSettingsDto, UpdateGuardSettingsInput } from '@surefy/contracts'

import {
  basisPointsToPercent,
  microsToUnits,
  percentToBasisPoints,
  unitsToMicros,
} from '../Guard.utils'
import { MINUTES_PER_UNIT, TARGET_UNITS } from './GuardDefaults.constants'

import type { TargetUnit } from './GuardDefaults.constants'
import type { GuardDefaultsOutput, GuardDefaultsValues } from './GuardDefaults.schema'

/** The target time in the largest unit that divides it evenly: 120 minutes reads as 2 hours. */
export function splitTargetMinutes(minutes: number): { value: number; unit: TargetUnit } {
  const unit = [...TARGET_UNITS]
    .reverse()
    .find((candidate) => minutes % MINUTES_PER_UNIT[candidate] === 0)
  const chosen = unit ?? 'minutes'
  return { value: minutes / MINUTES_PER_UNIT[chosen], unit: chosen }
}

export function toGuardDefaultsValues(settings: GuardSettingsDto): GuardDefaultsValues {
  const target = splitTargetMinutes(settings.targetDecisionMinutes)
  return {
    autoPercent: basisPointsToPercent(settings.autoThresholdBp),
    reviewPercent: basisPointsToPercent(settings.reviewThresholdBp),
    quickApproveAmount: microsToUnits(settings.quickApproveMaxAmountMicros),
    quickApproveRisk: settings.quickApproveMaxRisk,
    stepUpEnabled: settings.stepUpAmountMicros !== null,
    stepUpAmount:
      settings.stepUpAmountMicros === null ? null : microsToUnits(settings.stepUpAmountMicros),
    targetValue: target.value,
    targetUnit: target.unit,
  }
}

/** The values the API takes (`PUT …/defaults`, without the reason). */
export function toGuardSettingsInput(values: GuardDefaultsOutput): UpdateGuardSettingsInput {
  return {
    autoThresholdBp: percentToBasisPoints(values.autoPercent),
    reviewThresholdBp: percentToBasisPoints(values.reviewPercent),
    quickApproveMaxAmountMicros: unitsToMicros(values.quickApproveAmount),
    quickApproveMaxRisk: values.quickApproveRisk,
    stepUpAmountMicros:
      values.stepUpEnabled && values.stepUpAmount !== null
        ? unitsToMicros(values.stepUpAmount)
        : null,
    targetDecisionMinutes: (values.targetValue ?? 1) * MINUTES_PER_UNIT[values.targetUnit],
  }
}

export type LoosenedChange =
  | { kind: 'auto'; from: number; to: number }
  | { kind: 'review'; from: number; to: number }
  | { kind: 'quickAmount'; from: number; to: number }
  | { kind: 'quickRisk' }
  | { kind: 'stepUp'; from: number; to: number | null }

/** What the change loosens, so the confirmation can name it; empty when the save only tightens. */
export function getLoosenedChanges(
  settings: GuardSettingsDto,
  next: UpdateGuardSettingsInput,
): LoosenedChange[] {
  if (!guardDefaultsLoosened(settings, next)) return []
  const changes: LoosenedChange[] = []
  if (next.autoThresholdBp < settings.autoThresholdBp) {
    changes.push({
      kind: 'auto',
      from: basisPointsToPercent(settings.autoThresholdBp),
      to: basisPointsToPercent(next.autoThresholdBp),
    })
  }
  if (next.reviewThresholdBp < settings.reviewThresholdBp) {
    changes.push({
      kind: 'review',
      from: basisPointsToPercent(settings.reviewThresholdBp),
      to: basisPointsToPercent(next.reviewThresholdBp),
    })
  }
  if (next.quickApproveMaxAmountMicros > settings.quickApproveMaxAmountMicros) {
    changes.push({
      kind: 'quickAmount',
      from: microsToUnits(settings.quickApproveMaxAmountMicros),
      to: microsToUnits(next.quickApproveMaxAmountMicros),
    })
  }
  if (settings.quickApproveMaxRisk === 'low' && next.quickApproveMaxRisk === 'medium') {
    changes.push({ kind: 'quickRisk' })
  }
  const before = settings.stepUpAmountMicros
  if (before !== null && (next.stepUpAmountMicros === null || next.stepUpAmountMicros > before)) {
    changes.push({
      kind: 'stepUp',
      from: microsToUnits(before),
      to: next.stepUpAmountMicros === null ? null : microsToUnits(next.stepUpAmountMicros),
    })
  }
  return changes
}

/** How many of the form's settings differ from the saved ones, for "3 unsaved changes". */
export function countChangedSettings(
  saved: GuardDefaultsValues,
  current: GuardDefaultsValues,
): number {
  const keys = Object.keys(saved) as (keyof GuardDefaultsValues)[]
  const groups: (keyof GuardDefaultsValues)[][] = [
    ['autoPercent'],
    ['reviewPercent'],
    ['quickApproveAmount', 'quickApproveRisk'],
    ['stepUpEnabled', 'stepUpAmount'],
    ['targetValue', 'targetUnit'],
  ]
  return groups.filter((group) =>
    group.some((key) => keys.includes(key) && saved[key] !== current[key]),
  ).length
}
