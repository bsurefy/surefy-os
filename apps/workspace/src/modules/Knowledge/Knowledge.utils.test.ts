// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, it } from 'vitest'

import {
  canManageBase,
  getBaseStatus,
  getDaysLeft,
  getKnowledgeTab,
  splitPassages,
  toBaseListFilter,
  toBaseSort,
} from './Knowledge.utils'
import { documentFactory, sourceFactory } from '../../../mock/handlers/knowledge'

const NOW = new Date(2026, 9, 5, 12, 0)

const base = {
  sourceCount: 2,
  reindex: null,
  processing: { ready: 2, inProgress: 0, needsAttention: 0, progressPercent: 0 },
}

describe('getKnowledgeTab', () => {
  it('names the tab of the route and falls back to Sources', () => {
    expect(getKnowledgeTab('access')).toBe('access')
    expect(getKnowledgeTab('test-search')).toBe('test-search')
    expect(getKnowledgeTab(undefined)).toBe('sources')
    expect(getKnowledgeTab('nope')).toBe('sources')
  })
})

describe('toBaseListFilter and toBaseSort', () => {
  it('maps the list filter to the query and the column to a known sort', () => {
    expect(toBaseListFilter('attention')).toEqual({ needsAttention: true })
    expect(toBaseListFilter('local')).toEqual({ isLocalOnly: true })
    expect(toBaseListFilter('all')).toEqual({})
    expect(toBaseSort('updatedAt', true)).toBe('-updatedAt')
    expect(toBaseSort('name', false)).toBe('name')
    expect(toBaseSort('sources', true)).toBe('name')
  })
})

describe('getBaseStatus', () => {
  it('says the most pressing thing first: re-indexing, processing, attention, empty, ready', () => {
    expect(
      getBaseStatus({
        ...base,
        reindex: { target: null, documentsTotal: 4, documentsDone: 1 },
      } as never),
    ).toEqual({ kind: 'reindexing', percent: 25 })
    expect(
      getBaseStatus({
        ...base,
        processing: { ready: 1, inProgress: 2, needsAttention: 1, progressPercent: 40 },
      } as never),
    ).toEqual({ kind: 'processing', count: 2, percent: 40 })
    expect(
      getBaseStatus({
        ...base,
        processing: { ready: 1, inProgress: 0, needsAttention: 3, progressPercent: 0 },
      } as never),
    ).toEqual({ kind: 'attention', count: 3 })
    expect(getBaseStatus({ ...base, sourceCount: 0 } as never)).toEqual({ kind: 'empty' })
    expect(getBaseStatus(base as never)).toEqual({ kind: 'ready' })
  })
})

describe('getDaysLeft and canManageBase', () => {
  it('rounds the days left up and never goes below zero', () => {
    expect(getDaysLeft(new Date(NOW.getTime() + 60 * 60 * 1000).toISOString(), NOW)).toBe(1)
    expect(getDaysLeft(new Date(NOW.getTime() - 1000).toISOString(), NOW)).toBe(0)
    expect(getDaysLeft(null, NOW)).toBe(0)
  })

  it('lets only Can manage change a base', () => {
    expect(canManageBase({ effectiveLevel: 'manage' })).toBe(true)
    expect(canManageBase({ effectiveLevel: 'search' })).toBe(false)
  })
})

describe('splitPassages', () => {
  const text = 'Refunds are paid within 5 days. Contact support to ask.'
  const joined = (segments: { text: string }[]) => segments.map((segment) => segment.text).join('')

  it('marks each passage and keeps the text in between', () => {
    const segments = splitPassages(text, [
      { ordinal: 0, start: 0, end: 31 },
      { ordinal: 1, start: 32, end: text.length },
    ])
    expect(segments.map(({ passageOrdinal }) => passageOrdinal)).toEqual([0, null, 1])
    expect(joined(segments)).toBe(text)
  })

  it('cuts overlaps, clamps to the text and drops empty spans', () => {
    const segments = splitPassages(text, [
      { ordinal: 0, start: 0, end: 20 },
      { ordinal: 1, start: 10, end: 400 },
      { ordinal: 2, start: 30, end: 30 },
    ])
    expect(joined(segments)).toBe(text)
    expect(segments.map(({ passageOrdinal }) => passageOrdinal)).toEqual([0, 1])
  })

  it('returns the plain text when there are no passages', () => {
    expect(splitPassages(text, [])).toEqual([{ text, passageOrdinal: null }])
    expect(splitPassages('', [])).toEqual([])
  })
})

describe('fixtures', () => {
  it('build valid contract objects', () => {
    expect(sourceFactory().status).toBe('ready')
    expect(documentFactory().status).toBe('ready')
  })
})
