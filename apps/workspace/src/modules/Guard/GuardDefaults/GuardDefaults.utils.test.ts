// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, it } from 'vitest'

import {
  countChangedSettings,
  getLoosenedChanges,
  splitTargetMinutes,
  toGuardDefaultsValues,
  toGuardSettingsInput,
} from './GuardDefaults.utils'
import { GUARD_SETTINGS } from '../../../../mock/handlers/guard.fixtures'

import type { GuardDefaultsOutput } from './GuardDefaults.schema'

const saved = toGuardDefaultsValues(GUARD_SETTINGS)
const asOutput = (overrides: Partial<GuardDefaultsOutput> = {}) => ({ ...saved, ...overrides })

describe('splitTargetMinutes', () => {
  it('reads the largest unit that divides the minutes evenly', () => {
    expect(splitTargetMinutes(60)).toEqual({ value: 1, unit: 'hours' })
    expect(splitTargetMinutes(90)).toEqual({ value: 90, unit: 'minutes' })
    expect(splitTargetMinutes(2880)).toEqual({ value: 2, unit: 'days' })
  })
})

describe('toGuardDefaultsValues and toGuardSettingsInput', () => {
  it('round-trips the standard values', () => {
    expect(saved).toMatchObject({ autoPercent: 90, reviewPercent: 60, quickApproveAmount: 0 })
    expect(saved.stepUpEnabled).toBe(false)
    expect(toGuardSettingsInput(asOutput())).toEqual({
      autoThresholdBp: 9000,
      reviewThresholdBp: 6000,
      quickApproveMaxAmountMicros: 0,
      quickApproveMaxRisk: 'low',
      stepUpAmountMicros: null,
      targetDecisionMinutes: 60,
    })
  })

  it('turns an amount in the currency into micros, and a switched-off step-up into none', () => {
    const input = toGuardSettingsInput(
      asOutput({ quickApproveAmount: 25.5, stepUpEnabled: true, stepUpAmount: 500 }),
    )
    expect(input.quickApproveMaxAmountMicros).toBe(25_500_000)
    expect(input.stepUpAmountMicros).toBe(500_000_000)
    expect(
      toGuardSettingsInput(asOutput({ stepUpEnabled: false, stepUpAmount: 500 }))
        .stepUpAmountMicros,
    ).toBeNull()
  })
})

describe('getLoosenedChanges', () => {
  it('is empty when the save only tightens', () => {
    expect(
      getLoosenedChanges(GUARD_SETTINGS, toGuardSettingsInput(asOutput({ autoPercent: 95 }))),
    ).toEqual([])
  })

  it('names each setting that gets looser', () => {
    const changes = getLoosenedChanges(
      { ...GUARD_SETTINGS, stepUpAmountMicros: 100_000_000 },
      toGuardSettingsInput(
        asOutput({
          autoPercent: 80,
          reviewPercent: 40,
          quickApproveAmount: 50,
          quickApproveRisk: 'medium',
          stepUpEnabled: false,
          stepUpAmount: null,
        }),
      ),
    )
    expect(changes.map((change) => change.kind)).toEqual([
      'auto',
      'review',
      'quickAmount',
      'quickRisk',
      'stepUp',
    ])
  })
})

describe('countChangedSettings', () => {
  it('counts a setting once however many of its fields changed', () => {
    expect(countChangedSettings(saved, saved)).toBe(0)
    expect(
      countChangedSettings(saved, { ...saved, quickApproveAmount: 10, quickApproveRisk: 'medium' }),
    ).toBe(1)
    expect(countChangedSettings(saved, { ...saved, autoPercent: 80, targetValue: 2 })).toBe(2)
  })
})
