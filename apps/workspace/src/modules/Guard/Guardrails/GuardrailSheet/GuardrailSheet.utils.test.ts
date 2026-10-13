// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, it } from 'vitest'

import { createGuardrailFormSchema } from './GuardrailSheet.schema'
import {
  conditionValueToText,
  emptyGuardrailValues,
  splitWait,
  textToConditionValue,
  toApprovers,
  toCreateInput,
  toGuardrailDefinition,
  toGuardrailValues,
} from './GuardrailSheet.utils'
import { guardrailFactory, seedGuardrails } from '../../../../../mock/handlers/guard.fixtures'

const messages = {
  name: 'name',
  action: 'action',
  team: 'team',
  condition: 'condition',
  approvers: 'approvers',
  wait: 'wait',
  escalate: 'escalate',
  thresholds: 'thresholds',
  limit: 'limit',
  categories: 'categories',
}
const schema = createGuardrailFormSchema(messages)

describe('the form and the definition', () => {
  it.each(seedGuardrails().map((rule) => [rule.type, rule] as const))(
    'round-trips a %s through the form',
    (_type, rule) => {
      const parsed = schema.parse(toGuardrailValues(rule))
      expect(toGuardrailDefinition(parsed)).toEqual(rule.definition)
    },
  )

  it('keeps the conditions of a match, typed', () => {
    const rule = guardrailFactory({
      definition: {
        version: 1,
        kind: 'blocked_action',
        match: {
          action: 'a',
          conditions: [
            { field: 'amount', operator: 'gt', value: 200 },
            { field: 'region', operator: 'in', value: ['eu', 'us'] },
            { field: 'vip', operator: 'eq', value: true },
          ],
        },
      },
    })
    const parsed = schema.parse(toGuardrailValues(rule))
    expect(parsed.conditions.map((condition) => condition.value)).toEqual(['200', 'eu, us', 'true'])
    expect(toGuardrailDefinition(parsed)).toEqual(rule.definition)
  })

  it('builds the create input from a new rule', () => {
    const parsed = schema.parse({
      ...emptyGuardrailValues('blocked_action'),
      name: 'No price changes',
      action: 'catalog.update_price',
    })
    expect(toCreateInput(parsed)).toEqual({
      name: 'No price changes',
      scope: 'organization',
      definition: {
        version: 1,
        kind: 'blocked_action',
        match: { action: 'catalog.update_price' },
      },
      isEnabled: true,
    })
  })

  it('sends the team only for a team rule', () => {
    const teamId = '00000000-0000-4000-8000-000000000030'
    const parsed = schema.parse({
      ...emptyGuardrailValues('blocked_action'),
      name: 'Sales only',
      action: 'a',
      scope: 'team',
      teamId,
    })
    expect(toCreateInput(parsed)).toMatchObject({ scope: 'team', teamId })
  })
})

describe('validation', () => {
  const rejects = (values: Record<string, unknown>, path: string) => {
    const result = schema.safeParse({
      ...emptyGuardrailValues('blocked_action'),
      name: 'x',
      action: 'a',
      ...values,
    })
    expect(result.success).toBe(false)
    expect(result.error?.issues.map((issue) => issue.path[0])).toContain(path)
  }

  it('wants a team for a team rule', () => {
    rejects({ scope: 'team', teamId: null }, 'teamId')
  })

  it('wants approvers, and someone to escalate to when it escalates', () => {
    rejects({ type: 'approval_rule', approvers: [] }, 'approvers')
    rejects({ type: 'approval_rule', onTimeout: 'escalate', escalateTo: [] }, 'escalateTo')
  })

  it('keeps a wait within 30 days', () => {
    rejects({ type: 'approval_rule', waitAmount: 31, waitUnit: 'days' }, 'waitAmount')
  })

  it('wants a double-check threshold below the automatic one', () => {
    rejects({ type: 'threshold_override', autoPercent: 80, reviewPercent: 80 }, 'reviewPercent')
  })

  it('wants at least one limit and one category', () => {
    rejects({ type: 'action_limit' }, 'perDayCount')
    rejects({ type: 'content_filter', categories: [] }, 'categories')
  })
})

describe('helpers', () => {
  it('reads a wait in the biggest whole unit', () => {
    expect(splitWait(120)).toEqual({ amount: 2, unit: 'hours' })
    expect(splitWait(90)).toEqual({ amount: 90, unit: 'minutes' })
    expect(splitWait(2880)).toEqual({ amount: 2, unit: 'days' })
  })

  it('reads and writes condition values as text', () => {
    expect(conditionValueToText(['a', 1])).toBe('a, 1')
    expect(textToConditionValue('200', 'gt')).toBe(200)
    expect(textToConditionValue('false', 'eq')).toBe(false)
    expect(textToConditionValue('eu, 3', 'in')).toEqual(['eu', 3])
    expect(textToConditionValue('refund', 'eq')).toBe('refund')
  })

  it('keeps the approvers a picker value stands for and drops the rest', () => {
    expect(
      toApprovers(['role:admin', 'role:nobody', 'team:00000000-0000-4000-8000-000000000030']),
    ).toEqual([
      { type: 'role', id: 'admin' },
      { type: 'team', id: '00000000-0000-4000-8000-000000000030' },
    ])
  })
})
