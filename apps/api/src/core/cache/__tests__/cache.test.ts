// SPDX-License-Identifier: AGPL-3.0-only
import { pino } from 'pino'
import { describe, expect, it, vi } from 'vitest'

import { createCacheOver, orgKey, orgScope, versionedKey, type CacheClient } from '../index.js'

/** An in-memory stand-in for the ioredis commands the cache uses. */
function fakeClient(): CacheClient & { store: Map<string, string> } {
  const store = new Map<string, string>()
  const client = {
    store,
    get: vi.fn((key: string) => Promise.resolve(store.get(key) ?? null)),
    set: vi.fn((key: string, value: string) => {
      store.set(key, value)
      return Promise.resolve('OK')
    }),
    del: vi.fn((...keys: string[]) => {
      let count = 0
      for (const key of keys) if (store.delete(key)) count += 1
      return Promise.resolve(count)
    }),
    incr: vi.fn((key: string) => {
      const next = Number(store.get(key) ?? '0') + 1
      store.set(key, String(next))
      return Promise.resolve(next)
    }),
    ping: vi.fn(() => Promise.resolve('PONG')),
    quit: vi.fn(() => Promise.resolve('OK')),
    disconnect: vi.fn(),
    status: 'ready',
  }
  return client as unknown as CacheClient & { store: Map<string, string> }
}

const logger = pino({ level: 'silent' })

describe('cache', () => {
  it('stores JSON values with a TTL and reads them back', async () => {
    const client = fakeClient()
    const cache = createCacheOver(client, logger)
    await cache.set('k', { a: 1 }, 60)
    expect(client.set).toHaveBeenCalledWith('k', '{"a":1}', 'EX', 60)
    await expect(cache.get('k')).resolves.toEqual({ a: 1 })
    await expect(cache.get('missing')).resolves.toBeNull()
    await cache.del('k')
    await expect(cache.get('k')).resolves.toBeNull()
  })

  it('wrap loads once and serves the cached value afterwards', async () => {
    const cache = createCacheOver(fakeClient(), logger)
    const loader = vi.fn(() => Promise.resolve({ value: 42 }))
    await expect(cache.wrap('k', 60, loader)).resolves.toEqual({ value: 42 })
    await expect(cache.wrap('k', 60, loader)).resolves.toEqual({ value: 42 })
    expect(loader).toHaveBeenCalledTimes(1)
  })

  it('falls through to the loader when Redis fails, instead of failing the request', async () => {
    const client = fakeClient()
    vi.mocked(client.get).mockRejectedValue(new Error('down'))
    vi.mocked(client.set).mockRejectedValue(new Error('down'))
    const cache = createCacheOver(client, logger)
    await expect(cache.wrap('k', 60, () => Promise.resolve('fresh'))).resolves.toBe('fresh')
  })

  it('bumps and reads a scope version', async () => {
    const cache = createCacheOver(fakeClient(), logger)
    await expect(cache.getVersion(orgScope('o1'))).resolves.toBe(0)
    await expect(cache.bumpVersion(orgScope('o1'))).resolves.toBe(1)
    await expect(cache.getVersion(orgScope('o1'))).resolves.toBe(1)
  })

  it('builds org-scoped, versioned keys', () => {
    expect(orgKey('o1', 'access', 'u1')).toBe('org:o1:access:u1')
    expect(versionedKey(orgScope('o1'), 3, 'access', 'u1')).toBe('org:o1:access:u1:v3')
  })
})
