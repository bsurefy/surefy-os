// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, it } from 'vitest'

import {
  getEntryHref,
  getNeighbors,
  getRangeStart,
  hasActiveFilters,
  toEntryQuery,
  toExportParams,
} from './AuditLog.utils'
import { auditEntryFactory } from '../../../../mock/handlers/audit'

import type { AuditLogFilters } from './AuditLog.types'

const NOW = new Date('2026-01-15T09:30:42.500Z')

const noFilters: AuditLogFilters = {
  q: '',
  actor: null,
  person: null,
  action: null,
  object: null,
  result: null,
  range: 'all',
  entry: null,
}

describe('getRangeStart', () => {
  it('has no bound for all time', () => {
    expect(getRangeStart('all', NOW)).toBeNull()
  })

  it('goes back the preset and rounds down to the minute, so the query key is stable', () => {
    expect(getRangeStart('24h', NOW)).toBe('2026-01-14T09:30:00.000Z')
    expect(getRangeStart('7d', NOW)).toBe('2026-01-08T09:30:00.000Z')
  })
})

describe('toEntryQuery', () => {
  it('sends only the filters that are set', () => {
    expect(toEntryQuery(noFilters, NOW)).toEqual({
      q: undefined,
      actorType: undefined,
      actorUserId: undefined,
      action: undefined,
      targetType: undefined,
      outcome: undefined,
      from: undefined,
    })
  })

  it('maps the URL names to the API names', () => {
    expect(
      toEntryQuery(
        {
          ...noFilters,
          q: 'omar',
          actor: 'agent',
          person: 'u1',
          action: 'team.created',
          object: 'team',
          result: 'denied',
          range: '24h',
        },
        NOW,
      ),
    ).toEqual({
      q: 'omar',
      actorType: 'agent',
      actorUserId: 'u1',
      action: 'team.created',
      targetType: 'team',
      outcome: 'denied',
      from: '2026-01-14T09:30:00.000Z',
    })
  })
})

describe('hasActiveFilters', () => {
  it('ignores the open entry', () => {
    expect(hasActiveFilters({ ...noFilters, entry: 'e1' })).toBe(false)
  })

  it('counts a narrower date range as a filter', () => {
    expect(hasActiveFilters({ ...noFilters, range: '7d' })).toBe(true)
  })
})

describe('getEntryHref', () => {
  it('keeps the filters and adds the entry', () => {
    expect(getEntryHref({ ...noFilters, result: 'failed' }, 'e1')).toBe('?result=failed&entry=e1')
  })
})

describe('getNeighbors', () => {
  it('finds the rows before and after an entry', () => {
    const rows = [auditEntryFactory(), auditEntryFactory(), auditEntryFactory()]
    const [first, second, third] = rows
    expect(getNeighbors(rows, second?.id ?? '')).toEqual({ previous: first, next: third })
    expect(getNeighbors(rows, 'gone')).toEqual({ previous: null, next: null })
  })
})

describe('toExportParams', () => {
  it('carries the set filters and turns the range into bounds in the time zone', () => {
    expect(
      toExportParams(
        { ...noFilters, q: 'role', result: 'success', range: '24h', entry: 'e1' },
        'json',
        NOW,
        'Europe/Paris',
      ),
    ).toEqual({
      version: 1,
      format: 'json',
      filters: { q: 'role', result: 'success' },
      dateRange: {
        from: '2026-01-14T09:30:00.000Z',
        to: NOW.toISOString(),
        timeZone: 'Europe/Paris',
      },
    })
  })

  it('has no date range for all time', () => {
    expect(toExportParams(noFilters, 'csv', NOW, 'UTC')).toEqual({
      version: 1,
      format: 'csv',
      filters: {},
    })
  })
})
