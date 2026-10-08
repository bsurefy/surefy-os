// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, it } from 'vitest'

import { assignCallNames, slug } from '../agentTools.names.js'
import { effectivePermission, mayRetry } from '../agentTools.permissions.js'
import { createScrubber } from '../agentTools.scrub.js'
import { SchemaCache } from '../agentToolsSchemas.js'

describe('function names', () => {
  it('keeps what providers accept and falls back to "tool"', () => {
    expect(slug('Refund API (EU)')).toBe('Refund_API_EU')
    expect(slug('Café — orders')).toBe('Cafe_orders')
    expect(slug('日本語')).toBe('tool')
  })

  it('cuts to 64 characters and keeps cut names apart', () => {
    const long = 'a'.repeat(80)
    const [first, second] = assignCallNames([long, long])
    expect(first).toHaveLength(64)
    expect(second).toHaveLength(64)
    expect(second).toMatch(/_2$/)
    expect(second).not.toBe(first)
  })
})

describe('permissions', () => {
  it('only makes an action stricter', () => {
    expect(effectivePermission('read_only', { destructiveHint: true })).toBe('ask_first')
    expect(effectivePermission('read_only', { destructiveHint: false })).toBe('read_only')
    expect(effectivePermission('can_act', { destructiveHint: false })).toBe('can_act')
    expect(effectivePermission('can_act', null)).toBe('can_act')
  })

  it('repeats only what is safe to repeat', () => {
    const transient = { transient: true, beforeSend: false }
    expect(mayRetry('read_only', transient)).toBe(true)
    expect(mayRetry('can_act', transient)).toBe(false)
    expect(mayRetry('ask_first', { transient: true, beforeSend: true })).toBe(true)
    expect(mayRetry('read_only', { transient: false, beforeSend: true })).toBe(false)
  })
})

describe('masking credentials', () => {
  it('masks every injected value, and ignores values too short to be told apart', () => {
    const scrub = createScrubber(
      { version: 1, apiKey: 'key-123456', password: 'pw', extra: { region: 'eu-west-1' } },
      { authorization: 'Bearer abcdef123' },
    )
    expect(scrub('Bearer abcdef123 / key-123456 / eu-west-1 / pw')).toBe(
      '[redacted] / [redacted] / [redacted] / pw',
    )
    expect(scrub('abcdef123')).toBe('[redacted]')
  })
})

describe('the schema cache', () => {
  it('forgets after the time to live and keeps a bounded number of servers', () => {
    let now = 0
    const cache = new SchemaCache(() => now)
    const key = SchemaCache.key('org', null, 'https://mcp.test')
    cache.set(key, [
      {
        name: 'a',
        description: '',
        inputSchema: {},
        title: null,
        readOnlyHint: null,
        destructiveHint: null,
      },
    ])
    expect(cache.get(key)?.has('a')).toBe(true)
    now = 5 * 60_000 + 1
    expect(cache.get(key)).toBeUndefined()

    for (let index = 0; index < 250; index += 1) cache.set(`key-${String(index)}`, [])
    expect(cache.get('key-0')).toBeUndefined()
    expect(cache.get('key-249')).toBeDefined()
  })
})
