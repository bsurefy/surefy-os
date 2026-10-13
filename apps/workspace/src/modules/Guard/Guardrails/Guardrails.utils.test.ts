// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, it } from 'vitest'

import type { GuardrailDefinition, GuardrailDto } from '@surefy/contracts'

import {
  filterValue,
  getDependentCounts,
  isGuardrailLoosened,
  isMatchLoosened,
  statusToEnabled,
  toSortParam,
  toSortState,
} from './Guardrails.utils'
import { guardrailFactory, seedGuardrails } from '../../../../mock/handlers/guard.fixtures'

const seeds = seedGuardrails()
const seed = (index: number): GuardrailDto => {
  const found = seeds[index]
  if (!found) throw new Error('seed changed')
  return found
}
const refund = seed(0)
const blocked = seed(1)
const limit = seed(2)
const refundDefinition = refund.definition
if (refundDefinition.kind !== 'approval_rule') throw new Error('seed changed')
const approval = (patch: Partial<typeof refundDefinition>): GuardrailDefinition => ({
  ...refundDefinition,
  ...patch,
})

describe('sort and filters', () => {
  it('converts the sort both ways', () => {
    expect(toSortState('-triggeredThisWeek')).toEqual({ id: 'triggeredThisWeek', desc: true })
    expect(toSortParam({ id: 'name', desc: false })).toBe('name')
    expect(toSortParam({ id: 'name', desc: true })).toBe('-name')
  })

  it('drops "any" and reads on and off', () => {
    expect(filterValue('any')).toBeUndefined()
    expect(filterValue('team')).toBe('team')
    expect(statusToEnabled('on')).toBe(true)
    expect(statusToEnabled('off')).toBe(false)
    expect(statusToEnabled('any')).toBeUndefined()
  })
})

describe('isMatchLoosened', () => {
  const match = {
    action: 'payments.refund',
    conditions: [{ field: 'amount', operator: 'gt' as const, value: 200 }],
  }

  it('is false for the same match and when a condition is dropped or lowered', () => {
    expect(isMatchLoosened(match, match)).toBe(false)
    expect(isMatchLoosened(match, { action: 'payments.refund' })).toBe(false)
    expect(
      isMatchLoosened(match, {
        ...match,
        conditions: [{ field: 'amount', operator: 'gt', value: 100 }],
      }),
    ).toBe(false)
  })

  it('is true for another action, a raised bar or an added condition', () => {
    expect(isMatchLoosened(match, { ...match, action: 'payments.charge' })).toBe(true)
    expect(
      isMatchLoosened(match, {
        ...match,
        conditions: [{ field: 'amount', operator: 'gt', value: 500 }],
      }),
    ).toBe(true)
    expect(isMatchLoosened({ action: 'a' }, { action: 'a', conditions: match.conditions })).toBe(
      true,
    )
  })

  it('treats a shorter "in" list and a changed operator as looser', () => {
    const list = {
      action: 'a',
      conditions: [{ field: 'region', operator: 'in' as const, value: ['eu', 'us'] }],
    }
    expect(
      isMatchLoosened(list, {
        action: 'a',
        conditions: [{ field: 'region', operator: 'in', value: ['eu'] }],
      }),
    ).toBe(true)
    expect(
      isMatchLoosened(list, {
        action: 'a',
        conditions: [{ field: 'region', operator: 'in', value: ['eu', 'us', 'ca'] }],
      }),
    ).toBe(false)
    expect(
      isMatchLoosened(match, {
        ...match,
        conditions: [{ field: 'amount', operator: 'gte', value: 200 }],
      }),
    ).toBe(true)
  })
})

describe('isGuardrailLoosened', () => {
  it('counts turning a rule off but not turning it on', () => {
    expect(isGuardrailLoosened(blocked, { isEnabled: false, definition: blocked.definition })).toBe(
      true,
    )
    const off = guardrailFactory({ isEnabled: false })
    expect(isGuardrailLoosened(off, { isEnabled: true, definition: off.definition })).toBe(false)
  })

  it('counts an approval rule that continues on timeout, and nothing else about who approves', () => {
    expect(
      isGuardrailLoosened(refund, {
        isEnabled: true,
        definition: approval({ onTimeout: 'continue' }),
      }),
    ).toBe(true)
    expect(
      isGuardrailLoosened(refund, {
        isEnabled: true,
        definition: approval({
          risk: 'low',
          onTimeout: 'escalate',
          escalateTo: [{ type: 'role', id: 'owner' }],
        }),
      }),
    ).toBe(false)
  })

  it('counts a limit that is raised or removed, and a limit that asks instead of blocking', () => {
    const before = limit.definition
    if (before.kind !== 'action_limit') throw new Error('seed changed')
    const edit = (patch: Partial<typeof before>) => ({
      isEnabled: true,
      definition: { ...before, ...patch },
    })
    expect(isGuardrailLoosened(limit, edit({ limit: { perDayCount: 80 } }))).toBe(true)
    expect(isGuardrailLoosened(limit, edit({ limit: { perDayAmountMicros: 5 } }))).toBe(true)
    expect(isGuardrailLoosened(limit, edit({ limit: { perDayCount: 20 } }))).toBe(false)
    expect(isGuardrailLoosened(limit, edit({ onReached: 'require_approval' }))).toBe(true)
  })

  it('counts lower thresholds in an override and fewer categories in a content filter', () => {
    const override = guardrailFactory({
      type: 'threshold_override',
      definition: {
        version: 1,
        kind: 'threshold_override',
        match: { action: 'a' },
        autoBp: 9500,
        reviewBp: 7000,
      },
    })
    expect(
      isGuardrailLoosened(override, {
        isEnabled: true,
        definition: {
          version: 1,
          kind: 'threshold_override',
          match: { action: 'a' },
          autoBp: 9000,
          reviewBp: 7000,
        },
      }),
    ).toBe(true)
    const filter = guardrailFactory({
      type: 'content_filter',
      definition: {
        version: 1,
        kind: 'content_filter',
        match: { action: 'a' },
        categories: ['hate', 'violence'],
        action: 'block',
      },
    })
    expect(
      isGuardrailLoosened(filter, {
        isEnabled: true,
        definition: {
          version: 1,
          kind: 'content_filter',
          match: { action: 'a' },
          categories: ['hate'],
          action: 'block',
        },
      }),
    ).toBe(true)
    expect(
      isGuardrailLoosened(filter, {
        isEnabled: true,
        definition: {
          version: 1,
          kind: 'content_filter',
          match: { action: 'a' },
          categories: ['hate', 'violence', 'sexual'],
          action: 'block',
        },
      }),
    ).toBe(false)
  })
})

describe('getDependentCounts', () => {
  it('keeps the kinds that have dependents', () => {
    expect(
      getDependentCounts({
        dependents: [
          { type: 'agent', count: 3 },
          { type: 'flow', count: 0 },
        ],
        listed: [],
      }),
    ).toEqual([{ type: 'agent', count: 3 }])
  })
})
