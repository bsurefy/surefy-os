// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, it } from 'vitest'

import {
  basisPointsToPercent,
  getCurrencySymbol,
  microsToUnits,
  percentToBasisPoints,
  unitsToMicros,
} from './Guard.utils'

describe('amounts', () => {
  it('converts micros to units and back without drifting', () => {
    expect(microsToUnits(200_000_000)).toBe(200)
    expect(unitsToMicros(200)).toBe(200_000_000)
    expect(unitsToMicros(0.1 + 0.2)).toBe(300_000)
  })
})

describe('thresholds', () => {
  it('converts basis points to whole percents and back', () => {
    expect(basisPointsToPercent(9000)).toBe(90)
    expect(percentToBasisPoints(60)).toBe(6000)
  })
})

describe('getCurrencySymbol', () => {
  it('returns the symbol the locale writes before an amount', () => {
    expect(getCurrencySymbol('USD', 'en-US')).toBe('$')
    expect(getCurrencySymbol('EUR', 'en-US')).toBe('€')
  })
})
