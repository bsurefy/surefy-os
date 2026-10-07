// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, it } from 'vitest'

import {
  buildRows,
  fromDto,
  getCitationIndex,
  getErrorCode,
  getFailureKind,
  linkCitations,
  orderHistory,
  validateAttachment,
} from './ChatThread.utils'
import { chatMessageFactory } from '../../../../mock/handlers/chat.messages'

import type { ThreadSource, ThreadUiMessage } from './ChatThread.types'

const source = (index: number): ThreadSource => ({ index, kind: 'knowledge', title: `S${index}` })

describe('linkCitations', () => {
  it('links the numbers that name a source and leaves the rest', () => {
    expect(linkCitations('Yes [1]. Maybe [3]. See [2].', [source(1), source(2)])).toBe(
      'Yes [1](#source-1). Maybe [3]. See [2](#source-2).',
    )
  })

  it('leaves code blocks alone', () => {
    const text = 'Use `a[1]`.\n\n```js\nconst x = list[1]\n```\n\nThen [1].'
    expect(linkCitations(text, [source(1)])).toContain('list[1]')
    expect(linkCitations(text, [source(1)]).endsWith('Then [1](#source-1).')).toBe(true)
  })

  it('returns the text as it is without sources', () => {
    expect(linkCitations('A [1]', [])).toBe('A [1]')
  })
})

describe('getCitationIndex', () => {
  it('reads the number from a citation link only', () => {
    expect(getCitationIndex('#source-3')).toBe(3)
    expect(getCitationIndex('#other')).toBeNull()
    expect(getCitationIndex('https://example.com')).toBeNull()
    expect(getCitationIndex(undefined)).toBeNull()
  })
})

describe('validateAttachment', () => {
  it('accepts a supported file within its limit', () => {
    expect(validateAttachment({ type: 'image/png', size: 1024 })).toBeNull()
  })

  it('rejects an unsupported type and an oversized file', () => {
    expect(validateAttachment({ type: 'application/zip', size: 10 })).toBe(
      'CHAT_ATTACHMENT_UNSUPPORTED',
    )
    expect(validateAttachment({ type: 'image/png', size: 11 * 1024 * 1024 })).toBe(
      'CHAT_ATTACHMENT_TOO_LARGE',
    )
    expect(validateAttachment({ type: 'application/pdf', size: 11 * 1024 * 1024 })).toBeNull()
  })
})

describe('getErrorCode and getFailureKind', () => {
  it('reads the code of a stream error and of an error envelope', () => {
    expect(getErrorCode(new Error('BUDGET_EXCEEDED'))).toBe('BUDGET_EXCEEDED')
    expect(
      getErrorCode(new Error(JSON.stringify({ error: { code: 'RATE_LIMITED', message: 'x' } }))),
    ).toBe('RATE_LIMITED')
    expect(getErrorCode(new Error('network down'))).toBeNull()
    expect(getErrorCode(undefined)).toBeNull()
  })

  it('maps codes to cards', () => {
    expect(getFailureKind('BUDGET_EXCEEDED')).toBe('budget')
    expect(getFailureKind('RATE_LIMITED')).toBe('rate-limit')
    expect(getFailureKind('MODEL_PROVIDER_UNAVAILABLE')).toBe('unavailable')
    expect(getFailureKind(null)).toBe('generic')
  })
})

describe('orderHistory and buildRows', () => {
  const first = chatMessageFactory({ createdAt: '2026-01-02T09:00:00.000Z' })
  const second = chatMessageFactory({ role: 'assistant', createdAt: '2026-01-02T09:01:00.000Z' })

  it('reads history oldest first from newest-first pages', () => {
    expect(orderHistory([{ items: [second, first] }]).map((message) => message.id)).toEqual([
      first.id,
      second.id,
    ])
  })

  it('prefers the stored copy and adds stored messages the stream lacks', () => {
    const live: ThreadUiMessage[] = [
      { id: first.id, role: 'user', parts: [{ type: 'text', text: 'x' }] },
      { id: 'live-1', role: 'assistant', parts: [{ type: 'text', text: 'partial' }] },
    ]
    const rows = buildRows(live, [first, second], true)
    expect(rows.map((row) => row.id)).toEqual([first.id, 'live-1', second.id])
    expect(rows[0]?.isPersisted).toBe(true)
    expect(rows[1]).toMatchObject({ isPersisted: false, status: 'streaming' })
  })

  it('turns stored parts into thread parts, sources and notes', () => {
    const row = fromDto(
      chatMessageFactory({
        role: 'assistant',
        status: 'stopped',
        parts: {
          version: 1,
          parts: [
            { type: 'text', text: 'Hello' },
            { type: 'data', name: 'stopped', data: {} },
            {
              type: 'source',
              index: 1,
              kind: 'knowledge',
              title: 'Policy',
              snippet: 'x',
            },
          ],
        },
      }),
    )
    expect(row.status).toBe('stopped')
    expect(row.notes).toEqual([{ name: 'stopped' }])
    expect(row.sources).toEqual([expect.objectContaining({ index: 1, title: 'Policy' })])
  })
})
