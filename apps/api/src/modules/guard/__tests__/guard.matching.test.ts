// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, it } from 'vitest'

import type { GuardCondition, GuardMatch } from '@surefy/contracts'

import { actionMatches, conditionHolds, matchHolds } from '../guard.matching.js'

describe('actionMatches', () => {
  it('matches the action itself and the actions under a category', () => {
    expect(actionMatches('payments.refund', 'payments.refund')).toBe(true)
    expect(actionMatches('payments', 'payments.refund')).toBe(true)
    expect(actionMatches('payments.refund', 'payments')).toBe(false)
    expect(actionMatches('pay', 'payments.refund')).toBe(false)
  })
})

describe('conditionHolds', () => {
  const input = { amount: 340, order: { currency: 'USD', total: '12.5' }, tag: 'vip' }

  it.each<[GuardCondition, boolean]>([
    [{ field: 'amount', operator: 'gt', value: 200 }, true],
    [{ field: 'amount', operator: 'gt', value: 340 }, false],
    [{ field: 'amount', operator: 'gte', value: 340 }, true],
    [{ field: 'amount', operator: 'lt', value: 340 }, false],
    [{ field: 'amount', operator: 'lte', value: 340 }, true],
    [{ field: 'order.total', operator: 'gt', value: 10 }, true],
    [{ field: 'order.currency', operator: 'eq', value: 'USD' }, true],
    [{ field: 'order.currency', operator: 'neq', value: 'USD' }, false],
    [{ field: 'tag', operator: 'in', value: ['vip', 'gold'] }, true],
    [{ field: 'tag', operator: 'in', value: ['gold'] }, false],
  ])('evaluates %j as %s', (condition, expected) => {
    expect(conditionHolds(condition, input)).toBe(expected)
  })

  it('counts a condition it cannot evaluate as holding, so a rule never lets an action slip by', () => {
    expect(conditionHolds({ field: 'missing', operator: 'gt', value: 200 }, input)).toBe(true)
    expect(conditionHolds({ field: 'tag', operator: 'gt', value: 200 }, input)).toBe(true)
    expect(conditionHolds({ field: 'amount', operator: 'gt', value: 'many' }, input)).toBe(true)
    expect(conditionHolds({ field: 'amount.deep', operator: 'eq', value: 1 }, input)).toBe(true)
  })
})

describe('matchHolds', () => {
  it('needs the action and every condition', () => {
    const match: GuardMatch = {
      action: 'payments.refund',
      conditions: [
        { field: 'amount', operator: 'gt', value: 200 },
        { field: 'currency', operator: 'eq', value: 'USD' },
      ],
    }
    const action = (input: Record<string, unknown>, name = 'payments.refund') => ({ name, input })
    expect(matchHolds(match, action({ amount: 340, currency: 'USD' }))).toBe(true)
    expect(matchHolds(match, action({ amount: 100, currency: 'USD' }))).toBe(false)
    expect(matchHolds(match, action({ amount: 340, currency: 'EUR' }))).toBe(false)
    expect(matchHolds(match, action({ amount: 340, currency: 'USD' }, 'payments.charge'))).toBe(
      false,
    )
  })
})
