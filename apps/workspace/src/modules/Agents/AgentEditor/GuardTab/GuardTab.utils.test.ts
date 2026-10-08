// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, it } from 'vitest'

import {
  createApprovalRuleFormSchema,
  emptyApprovalRuleValues,
  toApprovalRule,
  toFormValues,
} from './GuardTab.schema'
import {
  fromApproverKey,
  isLooserThan,
  joinWait,
  raiseToOrganization,
  splitWait,
  toApproverKey,
} from './GuardTab.utils'

const ORGANIZATION = { autoBp: 9000, reviewBp: 6000 }
const TEAM_ID = '00000000-0001-4000-8000-000000000001'

describe('approver keys', () => {
  it('turn an approver into a picker value and back', () => {
    expect(toApproverKey({ type: 'role', id: 'admin' })).toBe('role:admin')
    expect(fromApproverKey('role:admin')).toEqual({ type: 'role', id: 'admin' })
    expect(fromApproverKey(`team:${TEAM_ID}`)).toEqual({ type: 'team', id: TEAM_ID })
  })

  it('refuse a value that names nobody', () => {
    expect(fromApproverKey('role:everyone')).toBeNull()
    expect(fromApproverKey('team:not-an-id')).toBeNull()
    expect(fromApproverKey('')).toBeNull()
  })
})

describe('waiting time', () => {
  it('is shown in the biggest whole unit', () => {
    expect(splitWait(60)).toEqual({ amount: 1, unit: 'hours' })
    expect(splitWait(2880)).toEqual({ amount: 2, unit: 'days' })
    expect(splitWait(90)).toEqual({ amount: 90, unit: 'minutes' })
  })

  it('goes back to minutes', () => {
    expect(joinWait(2, 'days')).toBe(2880)
    expect(joinWait(30, 'minutes')).toBe(30)
  })
})

describe('thresholds against the organization', () => {
  it('are looser when either is lower', () => {
    expect(isLooserThan(ORGANIZATION, { autoBp: 8000, reviewBp: 6000 })).toBe(true)
    expect(isLooserThan(ORGANIZATION, { autoBp: 9500, reviewBp: 5000 })).toBe(true)
    expect(isLooserThan(ORGANIZATION, { autoBp: 9000, reviewBp: 6000 })).toBe(false)
    expect(isLooserThan(ORGANIZATION, { autoBp: 9500, reviewBp: 7000 })).toBe(false)
  })

  it('are raised to the organization where lower, keeping review under automatic', () => {
    expect(raiseToOrganization(ORGANIZATION, { autoBp: 8000, reviewBp: 5000 })).toEqual(
      ORGANIZATION,
    )
    expect(raiseToOrganization(ORGANIZATION, { autoBp: 9500, reviewBp: 9800 })).toEqual({
      autoBp: 9500,
      reviewBp: 9500,
    })
  })
})

const schema = createApprovalRuleFormSchema({
  action: 'action',
  approvers: 'approvers',
  wait: 'wait',
  escalate: 'escalate',
})

describe('approval rule form', () => {
  const valid = { ...emptyApprovalRuleValues('Refund API') }
  const messageOf = (values: object) =>
    schema.safeParse({ ...valid, ...values }).error?.issues.map((issue) => issue.message)

  it('accepts a new rule with an action', () => {
    expect(schema.safeParse(valid).success).toBe(true)
  })

  it('needs an action, an approver, and a wait that fits 30 days', () => {
    expect(messageOf({ action: '  ' })).toEqual(['action'])
    expect(messageOf({ approvers: [] })).toEqual(['approvers'])
    expect(messageOf({ waitAmount: null })).toEqual(['wait'])
    expect(messageOf({ waitAmount: 31, waitUnit: 'days' })).toEqual(['wait'])
    expect(messageOf({ waits: false, waitAmount: null })).toBeUndefined()
  })

  it('needs someone to escalate to, only when waiting and escalating', () => {
    expect(messageOf({ onTimeout: 'escalate', escalateTo: [] })).toEqual(['escalate'])
    expect(messageOf({ onTimeout: 'escalate', escalateTo: ['role:admin'] })).toBeUndefined()
    expect(messageOf({ waits: false, onTimeout: 'escalate', escalateTo: [] })).toBeUndefined()
  })
})

describe('approval rule from the form', () => {
  const parse = (values: ReturnType<typeof emptyApprovalRuleValues>) => schema.parse(values)

  it('has no timeout action when it does not stop waiting', () => {
    const rule = toApprovalRule(
      parse({ ...emptyApprovalRuleValues('Refund API'), waits: false }),
      'r1',
    )
    expect(rule).toMatchObject({ waitMinutes: null, onTimeout: null, escalateTo: [] })
  })

  it('keeps who to escalate to only when it escalates', () => {
    const values = {
      ...emptyApprovalRuleValues('Refund API'),
      onTimeout: 'escalate' as const,
      escalateTo: ['role:owner'],
    }
    expect(toApprovalRule(parse(values), 'r1').escalateTo).toEqual([{ type: 'role', id: 'owner' }])
    expect(toApprovalRule(parse({ ...values, onTimeout: 'reject' }), 'r1').escalateTo).toEqual([])
  })

  it('keeps the conditions of a rule it did not make when editing it', () => {
    const previous = {
      id: 'r1',
      match: {
        action: 'payments.refund',
        conditions: [{ field: 'amount', operator: 'gt' as const, value: 200 }],
      },
      approvers: [{ type: 'role' as const, id: 'admin' as const }],
      waitMinutes: null,
      onTimeout: null,
      escalateTo: [],
      risk: 'high' as const,
    }
    const edited = toApprovalRule(
      parse({ ...toFormValues(previous), action: 'payments.refund.large' }),
      previous.id,
      previous,
    )
    expect(edited.match).toEqual({
      action: 'payments.refund.large',
      conditions: previous.match.conditions,
    })
    expect(edited.id).toBe('r1')
  })
})
