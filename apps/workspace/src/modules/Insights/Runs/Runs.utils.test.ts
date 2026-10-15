// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, it } from 'vitest'

import { fromTableSort, hasActiveFilters, toRunListQuery, toTableSort } from './Runs.utils'

import type { RunsFilters } from './Runs.types'

const NOW = new Date('2026-10-05T22:30:00.000Z')
const filters = (over: Partial<RunsFilters> = {}): RunsFilters => ({
  q: '',
  status: null,
  trigger: null,
  agent: null,
  team: null,
  model: null,
  human: false,
  range: 'any',
  from: null,
  to: null,
  sort: '-startedAt',
  ...over,
})

describe('the run list query', () => {
  it('sends only the filters that are set, newest first by default', () => {
    expect(toRunListQuery(filters(), NOW, 'UTC')).toEqual({
      q: undefined,
      status: undefined,
      trigger: undefined,
      agentId: undefined,
      teamId: undefined,
      modelKey: undefined,
      neededHuman: undefined,
      sort: '-startedAt',
    })
    expect(hasActiveFilters(filters())).toBe(false)
  })

  it('turns a preset or custom range into instants in the time zone', () => {
    expect(toRunListQuery(filters({ range: '7d' }), NOW, 'Asia/Kolkata')).toMatchObject({
      from: '2026-09-29T18:30:00.000Z',
      to: '2026-10-06T18:30:00.000Z',
    })
    expect(
      toRunListQuery(
        filters({ range: 'custom', from: '2026-09-01', to: '2026-09-02' }),
        NOW,
        'UTC',
      ),
    ).toMatchObject({ from: '2026-09-01T00:00:00.000Z', to: '2026-09-03T00:00:00.000Z' })
    // a broken custom range reads as any time
    expect(
      toRunListQuery(filters({ range: 'custom', from: '2026-09-05' }), NOW, 'UTC').from,
    ).toBeUndefined()
    expect(hasActiveFilters(filters({ range: '7d' }))).toBe(true)
  })

  it('maps the URL sort to the table and back', () => {
    expect(toTableSort('-costMicros')).toEqual({ id: 'costMicros', desc: true })
    expect(fromTableSort({ id: 'durationMs', desc: false })).toBe('durationMs')
    expect(fromTableSort({ id: 'agent', desc: true })).toBe('-startedAt')
  })
})
