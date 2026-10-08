// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, it } from 'vitest'

import {
  getAttentionHref,
  getCheckedTotal,
  getShare,
  isOverviewEmpty,
  splitMedian,
} from './GuardOverview.utils'
import { EMPTY_OVERVIEW, OVERVIEW } from '../../../../mock/handlers/guard.fixtures'

describe('getCheckedTotal', () => {
  it('counts the three bands and not the blocked actions', () => {
    expect(getCheckedTotal(OVERVIEW)).toBe(812 + 143 + 61)
  })
})

describe('isOverviewEmpty', () => {
  it('is true for a fresh install and false once anything happened', () => {
    expect(isOverviewEmpty(EMPTY_OVERVIEW)).toBe(true)
    expect(isOverviewEmpty({ ...EMPTY_OVERVIEW, blockedByLimits: 1 })).toBe(false)
    expect(isOverviewEmpty(OVERVIEW)).toBe(false)
  })
})

describe('getShare', () => {
  it('is a fraction of the total and zero without a total', () => {
    expect(getShare(1, 4)).toBe(0.25)
    expect(getShare(3, 0)).toBe(0)
  })
})

describe('splitMedian', () => {
  it('reads minutes under an hour and hours from an hour on', () => {
    expect(splitMedian(14)).toEqual({ unit: 'minutes', count: 14 })
    expect(splitMedian(0.2)).toEqual({ unit: 'minutes', count: 1 })
    expect(splitMedian(60)).toEqual({ unit: 'hours', count: 1 })
    expect(splitMedian(150)).toEqual({ unit: 'hours', count: 3 })
  })
})

describe('getAttentionHref', () => {
  it('links the queue, the rule and the agent', () => {
    const id = '00000000-0000-4000-8000-000000000001'
    expect(
      getAttentionHref(
        { kind: 'approvals_overdue', count: 1, target: { type: 'approvals', id: null } },
        'acme',
      ),
    ).toBe('/acme/insights/approvals')
    expect(
      getAttentionHref(
        { kind: 'guardrail_conflict', count: 1, target: { type: 'guardrail', id } },
        'acme',
      ),
    ).toBe(`/acme/guard/guardrails?rule=${id}`)
    expect(
      getAttentionHref(
        { kind: 'agent_thresholds_outdated', count: 2, target: { type: 'agent', id } },
        'acme',
      ),
    ).toBe(`/acme/agents/${id}/guard`)
  })
})
