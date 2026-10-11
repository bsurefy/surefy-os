// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, it } from 'vitest'

import {
  BUDGET_AUDIT_ACTIONS,
  BUDGET_DEFAULT_ALERT_THRESHOLDS_BP,
  budgetDtoSchema,
  budgetExceededDetailSchema,
  budgetMeterState,
  budgetThresholdReachedParamsSchema,
  budgetUsedBp,
  createBudgetInputSchema,
  ERROR_CODES,
  listBudgetsQuerySchema,
  notificationParamsSchema,
  PERMISSIONS,
  ROLE_PERMISSIONS,
  strictestBudgetAction,
  updateBudgetInputSchema,
  USAGE_ERROR_CODES,
} from '../index.js'

const id = '0190a5c4-0000-7000-8000-000000000001'
const id2 = '0190a5c4-0000-7000-8000-000000000002'

describe('budget writes', () => {
  it('creates an organization budget with the default action and alerts', () => {
    const parsed = createBudgetInputSchema.parse({
      scope: 'organization',
      amountMicros: 500_000_000,
    })
    expect(parsed).toEqual({
      scope: 'organization',
      amountMicros: 500_000_000,
      onReached: 'notify_only',
      alertThresholdsBp: [...BUDGET_DEFAULT_ALERT_THRESHOLDS_BP],
      isEnabled: true,
    })
  })

  it('needs the team or person that matches the scope', () => {
    expect(createBudgetInputSchema.safeParse({ scope: 'team', amountMicros: 1 }).success).toBe(
      false,
    )
    expect(
      createBudgetInputSchema.safeParse({ scope: 'team', teamId: id, amountMicros: 1 }).success,
    ).toBe(true)
    expect(
      createBudgetInputSchema.safeParse({ scope: 'user', userId: id2, amountMicros: 0 }).success,
    ).toBe(true)
    expect(createBudgetInputSchema.safeParse({ scope: 'credits', amountMicros: 1 }).success).toBe(
      false,
    )
  })

  it('keeps alert thresholds distinct, in range and sorted', () => {
    const parsed = createBudgetInputSchema.parse({
      scope: 'organization',
      amountMicros: 1,
      alertThresholdsBp: [10_000, 7500],
    })
    expect(parsed.alertThresholdsBp).toEqual([7500, 10_000])
    for (const alertThresholdsBp of [[0], [10_001], [5000, 5000], [1, 2, 3, 4, 5, 6]])
      expect(
        createBudgetInputSchema.safeParse({
          scope: 'organization',
          amountMicros: 1,
          alertThresholdsBp,
        }).success,
      ).toBe(false)
  })

  it('rejects negative amounts and empty updates', () => {
    expect(
      createBudgetInputSchema.safeParse({ scope: 'organization', amountMicros: -1 }).success,
    ).toBe(false)
    expect(updateBudgetInputSchema.safeParse({}).success).toBe(false)
    expect(updateBudgetInputSchema.parse({ onReached: 'pause_cloud_models' })).toEqual({
      onReached: 'pause_cloud_models',
    })
  })

  it('filters the list by scope', () => {
    expect(listBudgetsQuerySchema.parse({ scope: 'user', q: 'maya' }).scope).toEqual(['user'])
  })
})

describe('budget enforcement', () => {
  it('lets the strictest action win', () => {
    expect(strictestBudgetAction([])).toBeNull()
    expect(strictestBudgetAction(['notify_only', 'switch_to_local'])).toBe('switch_to_local')
    expect(strictestBudgetAction(['pause_cloud_models', 'switch_to_local', 'notify_only'])).toBe(
      'pause_cloud_models',
    )
  })

  it('turns the meter to warning at the highest alert below 100%, and reached at the amount', () => {
    expect(budgetUsedBp(430, 1000)).toBe(4300)
    expect(budgetMeterState(700, 1000)).toBe('ok')
    expect(budgetMeterState(800, 1000)).toBe('warning')
    expect(budgetMeterState(1000, 1000)).toBe('reached')
    expect(budgetMeterState(600, 1000, [5000, 10_000])).toBe('warning')
    expect(budgetMeterState(850, 1000, [10_000])).toBe('warning')
    expect(budgetMeterState(0, 0)).toBe('reached')
  })

  it('describes the budget that stopped a call', () => {
    expect(
      budgetExceededDetailSchema.safeParse({
        scope: 'team',
        amountMicros: 400_000_000,
        currency: 'USD',
        periodEnd: '2026-11-01',
      }).success,
    ).toBe(true)
  })

  it('sends threshold alerts as plain notification params', () => {
    const params = {
      version: 1,
      scope: 'team',
      scopeLabel: 'Support',
      thresholdBp: 8000,
      spentMicros: 320_000_000,
      amountMicros: 400_000_000,
      currency: 'USD',
      onReached: 'switch_to_local',
      periodStart: '2026-10-01',
    }
    expect(budgetThresholdReachedParamsSchema.safeParse(params).success).toBe(true)
    expect(notificationParamsSchema.safeParse(params).success).toBe(true)
  })
})

describe('budget rows', () => {
  it('carries the meter and who a person is charged to', () => {
    const budget = {
      id,
      scope: 'user',
      team: null,
      user: { id: id2, name: 'Maya', email: 'maya@example.com', imageUrl: null },
      primaryTeam: { id, name: 'Support' },
      period: 'month',
      amountMicros: 50_000_000,
      currency: 'USD',
      onReached: 'pause_cloud_models',
      alertThresholdsBp: [5000, 8000, 10_000],
      isEnabled: true,
      meter: {
        budgetId: id,
        scope: 'user',
        amountMicros: 50_000_000,
        effectiveAmountMicros: 50_000_000,
        spentMicros: 41_000_000,
        currency: 'USD',
        usedBp: 8200,
        state: 'warning',
        onReached: 'pause_cloud_models',
        periodStart: '2026-10-01',
        periodEnd: '2026-11-01',
      },
      lastAlert: { thresholdBp: 8000, triggeredAt: '2026-10-09T10:00:00.000Z' },
      updatedBy: null,
      createdAt: '2026-10-01T10:00:00.000Z',
      updatedAt: '2026-10-01T10:00:00.000Z',
    }
    expect(budgetDtoSchema.safeParse(budget).success).toBe(true)
    expect(budgetDtoSchema.safeParse({ ...budget, meter: null }).success).toBe(true)
  })
})

describe('budget codes, permissions and audit', () => {
  it('registers every error code', () => {
    for (const code of Object.values(USAGE_ERROR_CODES)) expect(ERROR_CODES[code]).toBe(code)
  })

  it('lets Builders read budgets and their own insights, and Admins change budgets', () => {
    expect(ROLE_PERMISSIONS.builder).toContain(PERMISSIONS.BUDGETS_READ)
    expect(ROLE_PERMISSIONS.builder).toContain(PERMISSIONS.INSIGHTS_READ_OWN)
    expect(ROLE_PERMISSIONS.builder).not.toContain(PERMISSIONS.BUDGETS_MANAGE)
    expect(ROLE_PERMISSIONS.builder).not.toContain(PERMISSIONS.INSIGHTS_READ)
    expect(ROLE_PERMISSIONS.user).not.toContain(PERMISSIONS.BUDGETS_READ)
    expect(ROLE_PERMISSIONS.admin).toContain(PERMISSIONS.BUDGETS_MANAGE)
  })

  it('names audit actions <area>.<verb>', () => {
    for (const action of Object.values(BUDGET_AUDIT_ACTIONS))
      expect(action).toMatch(/^budget\.[a-z_]+$/)
  })
})
