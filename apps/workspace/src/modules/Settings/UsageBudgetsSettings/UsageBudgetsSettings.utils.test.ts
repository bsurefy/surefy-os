// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, it } from 'vitest'

import { ERROR_CODES } from '@surefy/contracts'
import type { BudgetDto } from '@surefy/contracts'

import {
  getBudgetErrorField,
  getChargingExamples,
  getLoweredBelowSpend,
  getParentAmountMicros,
  getTeamsWithoutBudget,
  getWarningShare,
  toBudgetFormValues,
  toCreateBudgetInput,
  toUpdateBudgetInput,
  unitsToMicros,
} from './UsageBudgetsSettings.utils'
import { memberFactory } from '../../../../mock/handlers/members'
import { budgetFactory } from '../../../../mock/handlers/usage.budgets'

import type { BudgetFormOutput } from './UsageBudgetsSettings.schema'

const MICROS = 1_000_000
const SUPPORT = { id: '00000000-0000-4000-8000-000000000001', name: 'Support' }
const SALES = { id: '00000000-0000-4000-8000-000000000002', name: 'Sales' }

function withSpend(budget: BudgetDto, spentMicros: number): BudgetDto {
  return {
    ...budget,
    meter: {
      budgetId: budget.id,
      scope: budget.scope,
      amountMicros: budget.amountMicros,
      effectiveAmountMicros: budget.amountMicros,
      spentMicros,
      currency: budget.currency,
      usedBp: Math.floor((spentMicros * 10_000) / budget.amountMicros),
      state: 'ok',
      onReached: budget.onReached,
      periodStart: '2026-01-01',
      periodEnd: '2026-02-01',
    },
  }
}

const values = (overrides: Partial<BudgetFormOutput> = {}): BudgetFormOutput => ({
  targetId: '',
  amount: 500,
  onReached: 'notify_only',
  alertThresholdsBp: [5000, 8000, 10_000],
  isEnabled: true,
  ...overrides,
})

describe('getWarningShare', () => {
  it('turns to warning at the highest alert below 100%, or 80% without one', () => {
    expect(getWarningShare([5000, 8000, 10_000])).toBeCloseTo(0.8)
    expect(getWarningShare([5000, 10_000])).toBeCloseTo(0.5)
    expect(getWarningShare([10_000])).toBeCloseTo(0.8)
    expect(getWarningShare([])).toBeCloseTo(0.8)
  })
})

describe('getParentAmountMicros', () => {
  const organization = budgetFactory({ amountMicros: 2000 * MICROS })

  it('caps team and personal budgets at the enabled organization budget', () => {
    expect(getParentAmountMicros('team', organization)).toBe(2000 * MICROS)
    expect(getParentAmountMicros('user', organization)).toBe(2000 * MICROS)
  })

  it('has no cap for the organization itself, or without an enabled organization budget', () => {
    expect(getParentAmountMicros('organization', organization)).toBeNull()
    expect(getParentAmountMicros('team', { ...organization, isEnabled: false })).toBeNull()
    expect(getParentAmountMicros('team', null)).toBeNull()
  })
})

describe('form values', () => {
  it('starts a new budget at the defaults: notify only, alerts at 50, 80 and 100%', () => {
    expect(toBudgetFormValues(null)).toEqual({
      targetId: '',
      amount: null,
      onReached: 'notify_only',
      alertThresholdsBp: [5000, 8000, 10_000],
      isEnabled: true,
    })
  })

  it('creates a budget for the chosen team or person, in micros', () => {
    expect(toCreateBudgetInput('team', values({ targetId: SALES.id, amount: 12.5 }))).toEqual({
      scope: 'team',
      teamId: SALES.id,
      amountMicros: 12_500_000,
      onReached: 'notify_only',
      alertThresholdsBp: [5000, 8000, 10_000],
      isEnabled: true,
    })
    expect(toCreateBudgetInput('organization', values({ targetId: 'ignored' }))).not.toHaveProperty(
      'teamId',
    )
  })

  it('sends only the changed fields, and nothing when nothing changed', () => {
    const budget = budgetFactory({ amountMicros: 500 * MICROS })
    const unchanged = { ...toBudgetFormValues(budget), amount: 500 }
    expect(toUpdateBudgetInput(budget, unchanged)).toBeNull()
    expect(
      toUpdateBudgetInput(budget, { ...unchanged, alertThresholdsBp: [10_000, 8000, 5000] }),
    ).toBeNull()
    expect(
      toUpdateBudgetInput(budget, {
        ...unchanged,
        amount: 400,
        onReached: 'pause_cloud_models',
      }),
    ).toEqual({ amountMicros: 400 * MICROS, onReached: 'pause_cloud_models' })
  })

  it('rounds amounts to whole micros', () => {
    expect(unitsToMicros(0.1 + 0.2)).toBe(300_000)
  })
})

describe('getLoweredBelowSpend', () => {
  const support = withSpend(budgetFactory({ amountMicros: 500 * MICROS }), 430 * MICROS)

  it('names the spend when an enabled budget is lowered to it or below', () => {
    expect(getLoweredBelowSpend(support, values({ amount: 400 }))).toBe(430 * MICROS)
    expect(getLoweredBelowSpend(support, values({ amount: 430 }))).toBe(430 * MICROS)
  })

  it('asks nothing when the amount stays above the spend, rises, or the budget is off', () => {
    expect(getLoweredBelowSpend(support, values({ amount: 450 }))).toBeNull()
    expect(getLoweredBelowSpend(support, values({ amount: 600 }))).toBeNull()
    expect(getLoweredBelowSpend(support, values({ amount: 100, isEnabled: false }))).toBeNull()
    expect(getLoweredBelowSpend(null, values({ amount: 0 }))).toBeNull()
  })
})

describe('getChargingExamples', () => {
  it('names active people in several teams with the team they are charged to', () => {
    const members = [
      memberFactory({ teams: [SUPPORT, SALES], primaryTeamId: SALES.id }),
      memberFactory({ teams: [SUPPORT], primaryTeamId: SUPPORT.id }),
      memberFactory({ teams: [SUPPORT, SALES], primaryTeamId: null }),
      memberFactory({ teams: [SUPPORT, SALES], status: 'deactivated' }),
    ]
    expect(getChargingExamples(members)).toEqual([
      expect.objectContaining({ teams: ['Support', 'Sales'], primaryTeam: 'Sales' }),
      expect.objectContaining({ teams: ['Support', 'Sales'], primaryTeam: null }),
    ])
  })
})

describe('getTeamsWithoutBudget', () => {
  it('leaves out the teams that already have a budget', () => {
    const budgets = [budgetFactory({ scope: 'team', team: SUPPORT })]
    expect(getTeamsWithoutBudget([SUPPORT, SALES], budgets)).toEqual([SALES])
  })
})

describe('save errors', () => {
  it('puts each failure on the field it is about', () => {
    expect(getBudgetErrorField(ERROR_CODES.ACCESS_EXCEEDS_PARENT, true)).toBe('amount')
    expect(getBudgetErrorField(ERROR_CODES.BUDGET_ALREADY_EXISTS, true)).toBe('targetId')
    expect(getBudgetErrorField(ERROR_CODES.BUDGET_ALREADY_EXISTS, false)).toBe('root')
    expect(getBudgetErrorField(ERROR_CODES.BUDGET_NOT_FOUND, true)).toBe('root')
  })
})
