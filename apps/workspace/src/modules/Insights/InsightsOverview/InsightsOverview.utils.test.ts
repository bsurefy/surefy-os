// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, it } from 'vitest'

import type { InsightsBreakdownDto } from '@surefy/contracts'

import {
  addDays,
  dayIn,
  getRangeDays,
  intervalFor,
  isValidCustomRange,
  startOfDay,
  toCostGroups,
  toExportParams,
  toInsightsQuery,
} from './InsightsOverview.utils'

import type { InsightsOverviewFilters } from './InsightsOverview.types'

const NOW = new Date('2026-10-05T22:30:00.000Z')
const filters = (over: Partial<InsightsOverviewFilters> = {}): InsightsOverviewFilters => ({
  range: '30d',
  from: null,
  to: null,
  team: null,
  person: null,
  model: null,
  by: 'team',
  ...over,
})

describe('calendar days in a time zone', () => {
  it('reads the day where the person is', () => {
    expect(dayIn(NOW, 'UTC')).toBe('2026-10-05')
    expect(dayIn(NOW, 'Asia/Kolkata')).toBe('2026-10-06')
    expect(addDays('2026-10-01', -1)).toBe('2026-09-30')
  })

  it('finds midnight, also across a daylight saving change', () => {
    expect(startOfDay('2026-10-05', 'UTC')).toBe('2026-10-05T00:00:00.000Z')
    expect(startOfDay('2026-10-05', 'Asia/Kolkata')).toBe('2026-10-04T18:30:00.000Z')
    expect(startOfDay('2026-07-01', 'Europe/Berlin')).toBe('2026-06-30T22:00:00.000Z')
    expect(startOfDay('2026-03-29', 'Europe/Berlin')).toBe('2026-03-28T23:00:00.000Z')
    expect(startOfDay('2026-03-30', 'Europe/Berlin')).toBe('2026-03-29T22:00:00.000Z')
  })
})

describe('ranges', () => {
  it('counts today in every preset', () => {
    expect(getRangeDays(filters({ range: 'today' }), NOW, 'UTC')).toEqual({
      first: '2026-10-05',
      last: '2026-10-05',
    })
    expect(getRangeDays(filters({ range: '7d' }), NOW, 'UTC')).toEqual({
      first: '2026-09-29',
      last: '2026-10-05',
    })
  })

  it('uses a valid custom range and falls back to 30 days otherwise', () => {
    const custom = filters({ range: 'custom', from: '2026-09-01', to: '2026-09-10' })
    expect(getRangeDays(custom, NOW, 'UTC')).toEqual({ first: '2026-09-01', last: '2026-09-10' })
    expect(isValidCustomRange('2026-09-10', '2026-09-01')).toBe(false)
    expect(isValidCustomRange('2024-01-01', '2026-01-01')).toBe(false)
    expect(getRangeDays(filters({ range: 'custom' }), NOW, 'UTC').first).toBe('2026-09-06')
  })

  it('builds the query with exclusive end and the chosen filters', () => {
    const query = toInsightsQuery(filters({ range: '7d', team: 'team-1' }), NOW, 'Asia/Kolkata')
    expect(query).toEqual({
      from: '2026-09-29T18:30:00.000Z',
      to: '2026-10-06T18:30:00.000Z',
      timeZone: 'Asia/Kolkata',
      teamId: 'team-1',
    })
    expect(intervalFor(query)).toBe('day')
    expect(intervalFor(toInsightsQuery(filters({ range: 'today' }), NOW, 'UTC'))).toBe('hour')
  })

  it('exports what is on screen', () => {
    const query = toInsightsQuery(filters({ range: 'today', model: 'openai/gpt-4.1' }), NOW, 'UTC')
    expect(toExportParams(query)).toEqual({
      version: 1,
      format: 'csv',
      dateRange: {
        from: '2026-10-05T00:00:00.000Z',
        to: '2026-10-06T00:00:00.000Z',
        timeZone: 'UTC',
      },
      filters: { modelKey: ['openai/gpt-4.1'] },
    })
  })
})

describe('cost groups', () => {
  it('keeps the order and adds Others', () => {
    const totals = { requests: 2, inputTokens: 10, outputTokens: 5, cachedInputTokens: 0 }
    const breakdown: InsightsBreakdownDto = {
      by: 'team',
      rows: [
        {
          ...totals,
          key: 't1',
          label: 'Support',
          model: null,
          isLocal: false,
          cost: [{ currency: 'USD', costMicros: 2_000_000 }],
        },
        { ...totals, key: null, label: null, model: null, isLocal: false, cost: [] },
      ],
      others: { ...totals, cost: [{ currency: 'USD', costMicros: 500_000 }], groupCount: 3 },
      total: { ...totals, cost: [] },
    }
    const groups = toCostGroups(
      breakdown,
      (row) => row.label ?? 'No team',
      (count) => `Others (${count})`,
    )
    expect(groups.map((group) => [group.label, group.costMicros, group.isOthers])).toEqual([
      ['Support', 2_000_000, false],
      ['No team', 0, false],
      ['Others (3)', 500_000, true],
    ])
  })
})
