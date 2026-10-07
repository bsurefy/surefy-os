// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, it } from 'vitest'

import { chatMessagePartsSchema } from '@surefy/contracts'

import { PartsBuilder } from '../chatParts.js'

import type { UIMessageChunk } from 'ai'

const feed = (builder: PartsBuilder, chunks: UIMessageChunk[]) => {
  for (const chunk of chunks) builder.apply(chunk)
}

describe('PartsBuilder', () => {
  it('keeps text, reasoning and tool calls as separate parts', () => {
    let clock = 1000
    const builder = new PartsBuilder([], () => (clock += 500))
    feed(builder, [
      { type: 'reasoning-start', id: 'r1' },
      { type: 'reasoning-delta', id: 'r1', delta: 'Let me ' },
      { type: 'reasoning-delta', id: 'r1', delta: 'think.' },
      { type: 'reasoning-end', id: 'r1' },
      { type: 'tool-input-available', toolCallId: 'c1', toolName: 'search', input: { q: 'x' } },
      { type: 'tool-output-available', toolCallId: 'c1', output: { hits: 2 } },
      { type: 'tool-input-available', toolCallId: 'c2', toolName: 'fetch', input: {} },
      { type: 'tool-output-error', toolCallId: 'c2', errorText: 'boom' },
      { type: 'text-start', id: 't1' },
      { type: 'text-delta', id: 't1', delta: 'The answer ' },
      { type: 'text-delta', id: 't1', delta: 'is 42.' },
      { type: 'text-end', id: 't1' },
    ])
    const { parts } = builder.snapshot()
    expect(parts).toEqual([
      { type: 'reasoning', text: 'Let me think.', durationMs: 500 },
      {
        type: 'tool',
        toolCallId: 'c1',
        toolName: 'search',
        state: 'done',
        input: { q: 'x' },
        output: { hits: 2 },
      },
      {
        type: 'tool',
        toolCallId: 'c2',
        toolName: 'fetch',
        state: 'error',
        input: {},
        errorCode: 'TOOL_FAILED',
      },
      { type: 'text', text: 'The answer is 42.' },
    ])
    expect(builder.hasText).toBe(true)
    expect(chatMessagePartsSchema.safeParse(builder.snapshot()).success).toBe(true)
  })

  it('numbers web sources after the knowledge ones', () => {
    const builder = new PartsBuilder([
      { type: 'source', index: 1, kind: 'knowledge', title: 'Handbook', snippet: 's' },
      { type: 'source', index: 2, kind: 'knowledge', title: 'FAQ', snippet: 's' },
    ])
    feed(builder, [
      { type: 'source-url', sourceId: 's', url: 'https://example.test/a', title: 'Example' },
      { type: 'source-url', sourceId: 't', url: 'https://example.test/b' },
    ])
    expect(builder.sources.map((source) => [source.index, source.kind, source.title])).toEqual([
      [1, 'knowledge', 'Handbook'],
      [2, 'knowledge', 'FAQ'],
      [3, 'web', 'Example'],
      [4, 'web', 'https://example.test/b'],
    ])
  })

  it('reports no text for an answer that produced none, and snapshots do not alias the builder', () => {
    const builder = new PartsBuilder([
      { type: 'model-switch', fromModelKey: 'a/x', toModelKey: 'a/y' },
    ])
    expect(builder.hasText).toBe(false)
    const before = builder.snapshot()
    builder.push({ type: 'data', name: 'stopped', data: {} })
    expect(before.parts).toHaveLength(1)
    expect(builder.snapshot().parts).toHaveLength(2)
  })
})
