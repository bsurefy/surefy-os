// SPDX-License-Identifier: AGPL-3.0-only
import type { CacheClient } from '@/core/cache/index.js'

/** Better Auth's keys live under `auth:` next to the rest of the cache (`surefy:` prefix). */
const AUTH_KEY_PREFIX = 'auth:'

/** INCR that sets the TTL only when it creates the key, in one atomic step. */
const INCREMENT_SCRIPT = `local value = redis.call('INCR', KEYS[1])
if value == 1 then redis.call('EXPIRE', KEYS[1], ARGV[1]) end
return value`

/** What Better Auth's `secondaryStorage` option takes. */
export interface AuthSecondaryStorage {
  get(key: string): Promise<string | null>
  getAndDelete(key: string): Promise<string | null>
  increment(key: string, ttl: number): Promise<number>
  set(key: string, value: string, ttl?: number): Promise<void>
  delete(key: string): Promise<void>
}

/**
 * Session cache and rate-limit counters in Redis (authentication.md, §2). Sessions are also stored
 * in the database, so a Redis flush signs nobody out.
 */
export function redisSecondaryStorage(client: CacheClient): AuthSecondaryStorage {
  return {
    get: (key) => client.get(`${AUTH_KEY_PREFIX}${key}`),
    getAndDelete: (key) => client.getdel(`${AUTH_KEY_PREFIX}${key}`),
    async increment(key, ttl) {
      const value = await client.eval(INCREMENT_SCRIPT, 1, `${AUTH_KEY_PREFIX}${key}`, ttl)
      return Number(value)
    },
    async set(key, value, ttl) {
      if (ttl !== undefined && ttl > 0)
        await client.set(`${AUTH_KEY_PREFIX}${key}`, value, 'EX', ttl)
      else await client.set(`${AUTH_KEY_PREFIX}${key}`, value)
    },
    async delete(key) {
      await client.del(`${AUTH_KEY_PREFIX}${key}`)
    },
  }
}
