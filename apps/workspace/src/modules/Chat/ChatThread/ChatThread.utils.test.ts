// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, it } from 'vitest'

import type { ChatMessageDto } from '@surefy/contracts'

import {
  buildRows,
  fromDto,
  fromUi,
  getCitationIndex,
  getErrorCode,
  getFailureKind,
  groupComparisons,
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

describe('approval notes', () => {
  const approvalId = '0190a5c4-0000-7000-8000-0000000000aa'

  it('reads the stored approval card of an agent answer', () => {
    const row = fromDto(
      chatMessageFactory({
        role: 'assistant',
        status: 'streaming',
        parts: {
          version: 1,
          parts: [
            { type: 'text', text: 'A refund needs approval first.' },
            { type: 'data', name: 'approval', data: { approvalId } },
          ],
        },
      }),
    )
    expect(row.notes).toEqual([{ name: 'approval', approvalId }])
  })

  it('takes who decides and the expiry from the live stream', () => {
    const assignees = [
      {
        subjectType: 'team' as const,
        user: null,
        team: { id: approvalId, name: 'Finance' },
        role: null,
        source: 'rule' as const,
      },
    ]
    const message: ThreadUiMessage = {
      id: 'a1',
      role: 'assistant',
      parts: [
        {
          type: 'data-approval-required',
          data: { seq: 2, approvalId, title: 'Refund order #1001', assignees, expiresAt: null },
        },
      ],
    }
    expect(fromUi(message, true).notes).toEqual([
      { name: 'approval', approvalId, title: 'Refund order #1001', assignees, expiresAt: null },
    ])
  })
})

const GROUP = '00000000-0000-4000-8000-0000000000a1'

const answer = (id: string, variant: ChatMessageDto['variant'], modelKey = 'openai/gpt-4.1') =>
  chatMessageFactory({
    id,
    role: 'assistant',
    modelKey,
    variant,
    parts: { version: 1, parts: [{ type: 'text', text: id }] },
  })

describe('groupComparisons', () => {
  it('pairs answer A with the answer B of its group', () => {
    const rows = [
      fromDto(chatMessageFactory({ id: '00000000-0000-4000-8000-000000000001' })),
      fromDto(answer('00000000-0000-4000-8000-00000000000a', { groupId: GROUP, label: 'a' })),
      fromDto(answer('00000000-0000-4000-8000-00000000000b', { groupId: GROUP, label: 'b' })),
    ]
    const items = groupComparisons(rows)
    expect(items.map((item) => item.kind)).toEqual(['message', 'comparison'])
    expect(items[1]).toMatchObject({ a: { id: rows[1]?.id }, b: { id: rows[2]?.id } })
  })

  it('lists an answer whose partner is gone like any other message', () => {
    const rows = [
      fromDto(answer('00000000-0000-4000-8000-00000000000a', { groupId: GROUP, label: 'a' })),
      fromDto(answer('00000000-0000-4000-8000-00000000000c', null)),
    ]
    expect(groupComparisons(rows).map((item) => item.kind)).toEqual(['message', 'message'])
  })

  it('does not pair answers of different comparisons', () => {
    const other = '00000000-0000-4000-8000-0000000000a2'
    const rows = [
      fromDto(answer('00000000-0000-4000-8000-00000000000a', { groupId: GROUP, label: 'a' })),
      fromDto(answer('00000000-0000-4000-8000-00000000000b', { groupId: other, label: 'b' })),
    ]
    expect(groupComparisons(rows).map((item) => item.kind)).toEqual(['message', 'message'])
  })

  it('pairs the live answers of a comparison that has no group yet', () => {
    const live = (id: string, text: string): ThreadUiMessage => ({
      id,
      role: 'assistant',
      parts: [{ type: 'text', text }],
    })
    const rows = buildRows([live('a1', 'from A')], [], true, null, {
      message: live('b1', 'from B'),
      isStreaming: true,
      errorCode: null,
    })
    expect(rows.map((row) => row.variant?.label)).toEqual(['a', 'b'])
    expect(groupComparisons(rows).map((item) => item.kind)).toEqual(['comparison'])
  })

  it('marks answer B failed when its request failed', () => {
    const rows = buildRows(
      [{ id: 'a1', role: 'assistant', parts: [{ type: 'text', text: 'from A' }] }],
      [],
      false,
      null,
      {
        message: { id: 'b1', role: 'assistant', parts: [] },
        isStreaming: false,
        errorCode: 'MODEL_PROVIDER_UNAVAILABLE',
      },
    )
    expect(rows[1]).toMatchObject({ status: 'failed', errorCode: 'MODEL_PROVIDER_UNAVAILABLE' })
  })
})

describe('fromDto: web search', () => {
  it('keeps the query of a web search step and the note of a skipped search', () => {
    const searched = fromDto(
      chatMessageFactory({
        role: 'assistant',
        parts: {
          version: 1,
          parts: [
            {
              type: 'tool',
              toolCallId: 'call-1',
              toolName: 'webSearch',
              state: 'done',
              input: { query: 'refund rules' },
            },
            { type: 'data', name: 'web-search-skipped', data: { reason: 'pii_blocked' } },
          ],
        },
      }),
    )
    expect(searched.parts[0]).toMatchObject({ kind: 'tool', query: 'refund rules' })
    expect(searched.notes).toEqual([{ name: 'web-search-skipped', reason: 'pii_blocked' }])
  })
})
