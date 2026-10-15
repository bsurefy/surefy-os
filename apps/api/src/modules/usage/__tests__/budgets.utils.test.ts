// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, it } from 'vitest'

import { applicableBudgets, type CachedBudget } from '../budgetEnforcement.js'
import {
  crossedThresholds,
  effectiveAmount,
  nextMonth,
  periodOf,
  reachedThresholds,
  yyyymm,
} from '../budgets.utils.js'

const budget = (over: Partial<CachedBudget>): CachedBudget => ({
  id: 'b',
  scope: 'organization',
  teamId: null,
  userId: null,
  amountMicros: 1000,
  currency: 'USD',
  onReached: 'notify_only',
  alertThresholdsBp: [5000, 8000, 10_000],
  ...over,
})

describe('budget periods', () => {
  it('runs from the first of the UTC month to the first of the next', () => {
    expect(periodOf(new Date('2026-12-31T23:59:59Z'))).toEqual({
      periodStart: '2026-12-01',
      periodEnd: '2027-01-01',
    })
    expect(nextMonth('2026-01-01')).toBe('2026-02-01')
    expect(yyyymm('2026-10-01')).toBe('202610')
  })
})

describe('budget thresholds', () => {
  it('reports the thresholds a spend went past, once each', () => {
    expect(crossedThresholds(400, 900, 1000, [5000, 8000, 10_000])).toEqual([5000, 8000])
    expect(crossedThresholds(500, 700, 1000, [5000, 8000, 10_000])).toEqual([])
    expect(crossedThresholds(999, 1000, 1000, [10_000])).toEqual([10_000])
  })

  it('counts every threshold as reached at a zero amount', () => {
    expect(reachedThresholds(0, 0, [5000, 10_000])).toEqual([5000, 10_000])
    expect(reachedThresholds(799, 1000, [5000, 8000])).toEqual([5000])
  })

  it('caps a team or personal amount at the organization amount', () => {
    expect(effectiveAmount(400, 300)).toBe(300)
    expect(effectiveAmount(200, 300)).toBe(200)
    expect(effectiveAmount(200, null)).toBe(200)
  })
})

describe('applicable budgets', () => {
  const enabled = [
    budget({ id: 'org', amountMicros: 300 }),
    budget({ id: 'support', scope: 'team', teamId: 'team-support', amountMicros: 400 }),
    budget({ id: 'sales', scope: 'team', teamId: 'team-sales' }),
    budget({ id: 'uma', scope: 'user', userId: 'user-uma', amountMicros: 100 }),
    budget({ id: 'eur', scope: 'team', teamId: 'team-support', currency: 'EUR' }),
  ]

  it('charges a person, their primary team and the organization', () => {
    const applied = applicableBudgets(enabled, { userId: 'user-uma', teamId: 'team-support' })
    expect(applied.map((b) => [b.id, b.effectiveAmountMicros])).toEqual([
      ['org', 300],
      ['support', 300],
      ['uma', 100],
      ['eur', 1000],
    ])
  })

  it('charges calls without a person to the organization only', () => {
    const applied = applicableBudgets(enabled, { userId: null, teamId: null })
    expect(applied.map((b) => b.id)).toEqual(['org'])
  })
})
