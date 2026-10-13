// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, it } from 'vitest'

import { fixtureUuid } from '@surefy/web-core/testing'

import {
  getAssigneeNames,
  getBulkSelection,
  hasActiveFilters,
  toListQuery,
} from './Approvals.utils'
import { approvalFactory } from '../../../../mock/handlers/approvals'

const filters = { view: 'pending', q: '', kind: null, risk: null } as const

describe('toListQuery', () => {
  it('asks for the pending items, oldest first', () => {
    expect(toListQuery(filters)).toEqual({ status: 'pending', sort: 'createdAt' })
  })

  it('asks for what was decided today, newest first, with the search and facets', () => {
    expect(toListQuery({ view: 'decided', q: 'refund', kind: 'ai_action', risk: 'low' })).toEqual({
      q: 'refund',
      kind: 'ai_action',
      risk: 'low',
      decidedToday: true,
      sort: '-decidedAt',
    })
  })
})

describe('hasActiveFilters', () => {
  it('ignores the view', () => {
    expect(hasActiveFilters(filters)).toBe(false)
    expect(hasActiveFilters({ ...filters, risk: 'high' })).toBe(true)
    expect(hasActiveFilters({ ...filters, q: 'x' })).toBe(true)
  })
})

describe('getBulkSelection', () => {
  const first = approvalFactory({ ruleRef: 'rule-a', quickApprovable: true })
  const second = approvalFactory({ ruleRef: 'rule-a', quickApprovable: true })
  const otherRule = approvalFactory({ ruleRef: 'rule-b', quickApprovable: true })
  const overLimit = approvalFactory({ ruleRef: 'rule-a', quickApprovable: false })
  const readOnly = approvalFactory({ ruleRef: 'rule-a', quickApprovable: true, canDecide: false })
  const rows = [first, second, otherRule, overLimit, readOnly]
  const pick = (...items: { id: string }[]) =>
    Object.fromEntries(items.map((item) => [item.id, true as const]))

  it('allows items of one rule that fit the quick-approve limit', () => {
    const result = getBulkSelection(rows, pick(first, second))
    expect(result).toEqual({ ids: [first.id, second.id], blockedCount: 0, isAllowed: true })
  })

  it('refuses items of different rules and says how many would have to leave', () => {
    const result = getBulkSelection(rows, pick(first, second, otherRule))
    expect(result).toEqual({ ids: [], blockedCount: 1, isAllowed: false })
  })

  it('refuses items over the limit and items the person cannot decide', () => {
    expect(getBulkSelection(rows, pick(first, overLimit)).blockedCount).toBe(1)
    expect(getBulkSelection(rows, pick(first, readOnly)).isAllowed).toBe(false)
  })

  it('offers nothing for an empty selection', () => {
    expect(getBulkSelection(rows, {})).toEqual({ ids: [], blockedCount: 0, isAllowed: false })
  })
})

describe('getAssigneeNames', () => {
  it('names people, teams and roles once each', () => {
    const names = getAssigneeNames(
      approvalFactory({
        assignees: [
          { subjectType: 'role', user: null, team: null, role: 'admin', source: 'rule' },
          { subjectType: 'role', user: null, team: null, role: 'admin', source: 'escalation' },
          {
            subjectType: 'team',
            user: null,
            team: { id: fixtureUuid(30, 9), name: 'Finance' },
            role: null,
            source: 'rule',
          },
        ],
      }),
      (role) => `${role}s`,
    )
    expect(names).toBe('admins, Finance')
  })
})
