// SPDX-License-Identifier: AGPL-3.0-only
import { Redis } from 'ioredis'

import type { Config } from '@/core/config/index.js'
import type { Logger } from '@/core/logger/index.js'

export const CACHE_KEY_PREFIX = 'surefy:'

/** The subset of ioredis the cache uses, so tests can pass a fake. */
export type CacheClient = Pick<
  Redis,
  'get' | 'set' | 'del' | 'incr' | 'ping' | 'quit' | 'disconnect' | 'status'
>

export interface Cache {
  /** The underlying client, for stores that need Redis directly (rate limiting). */
  client: CacheClient
  get<T>(key: string): Promise<T | null>
  set(key: string, value: unknown, ttlSeconds: number): Promise<void>
  del(...keys: readonly string[]): Promise<void>
  /** Read-through: returns the cached value, or loads, stores for `ttlSeconds` and returns it. */
  wrap<T>(key: string, ttlSeconds: number, loader: () => Promise<T>): Promise<T>
  /** Invalidates every versioned key under a scope at once (see keys.ts). */
  bumpVersion(scope: string): Promise<number>
  getVersion(scope: string): Promise<number>
  ping(): Promise<void>
  quit(): Promise<void>
}

const versionKey = (scope: string) => `${scope}:version`

/**
 * Builds the cache over a client. A cache failure never fails the request: reads fall through to
 * the loader and writes are skipped, with a warning. Readiness still reports Redis as down.
 */
export function createCacheOver(client: CacheClient, logger: Logger): Cache {
  const warn = (operation: string, key: string, error: unknown) => {
    logger.warn({ err: error, operation, key }, 'cache operation failed')
  }

  const get = async <T>(key: string): Promise<T | null> => {
    let raw: string | null
    try {
      raw = await client.get(key)
    } catch (error) {
      warn('get', key, error)
      return null
    }
    return raw === null ? null : (JSON.parse(raw) as T)
  }

  const set = async (key: string, value: unknown, ttlSeconds: number): Promise<void> => {
    try {
      await client.set(key, JSON.stringify(value), 'EX', ttlSeconds)
    } catch (error) {
      warn('set', key, error)
    }
  }

  return {
    client,
    get,
    set,
    async del(...keys) {
      if (keys.length === 0) return
      try {
        await client.del(...keys)
      } catch (error) {
        warn('del', keys.join(','), error)
      }
    },
    async wrap(key, ttlSeconds, loader) {
      const cached = await get<Awaited<ReturnType<typeof loader>>>(key)
      if (cached !== null) return cached
      const value = await loader()
      await set(key, value, ttlSeconds)
      return value
    },
    bumpVersion: (scope) => client.incr(versionKey(scope)),
    async getVersion(scope) {
      const raw = await client.get(versionKey(scope))
      return raw === null ? 0 : Number(raw)
    },
    async ping() {
      await client.ping()
    },
    async quit() {
      // A lazy client that never connected has no connection to say goodbye to.
      if (client.status === 'wait' || client.status === 'end') {
        client.disconnect()
        return
      }
      await client.quit()
    },
  }
}

/** The Redis cache client. It connects lazily, on the first command (or `ping()`). */
export function createCache(config: Config, logger: Logger): Cache {
  const client = new Redis(config.redis.url, {
    keyPrefix: CACHE_KEY_PREFIX,
    lazyConnect: true,
    // Fail fast instead of retrying a command forever while Redis is down.
    maxRetriesPerRequest: 2,
  })
  client.on('error', (error) => {
    logger.warn({ err: error }, 'redis client error')
  })
  return createCacheOver(client, logger)
}
