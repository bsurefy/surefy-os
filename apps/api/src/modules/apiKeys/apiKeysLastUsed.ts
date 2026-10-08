// SPDX-License-Identifier: AGPL-3.0-only
import { z } from 'zod'

import {
  FLUSH_BATCH,
  LAST_USED_BUFFER_KEY,
  LAST_USED_BUFFER_TTL_SECONDS,
  SYSTEM_REASON,
} from './apiKeys.constants.js'

import type { ApiKeysRepository, LastUsedEntry } from './apiKeys.repository.js'
import type { CacheClient } from '@/core/cache/index.js'
import type { Database } from '@/core/database/index.js'
import type { Logger } from '@/core/logger/index.js'

// Writing `last_used_at` on every call would turn each API request into a write. The resolver
// notes the use in one Redis hash instead; the `apiKeysFlushLastUsed` job writes the hash to the
// table every few minutes (access-and-entitlements.md, §2).

const RECORD_SCRIPT = `
redis.call('HSET', KEYS[1], ARGV[1], ARGV[2])
redis.call('EXPIRE', KEYS[1], ARGV[3])
return 1`

// Reads and clears the hash in one step, so a use noted meanwhile starts the next batch.
const TAKE_SCRIPT = `
local entries = redis.call('HGETALL', KEYS[1])
redis.call('DEL', KEYS[1])
return entries`

const bufferedUseSchema = z.object({ at: z.iso.datetime(), ip: z.string().nullable() })

const MEMBER_PATTERN = /^([0-9a-f-]{36}):([0-9a-f-]{36})$/

export interface ApiKeysLastUsedDeps {
  client: Pick<CacheClient, 'eval'>
  db: Database
  repository: ApiKeysRepository
  logger: Logger
}

export class ApiKeysLastUsed {
  constructor(private readonly deps: ApiKeysLastUsedDeps) {}

  /** A failure never fails the call: `last_used_at` is best effort and may lag. */
  async record(orgId: string, keyId: string, ip: string | null, at = new Date()): Promise<void> {
    try {
      await this.deps.client.eval(
        RECORD_SCRIPT,
        1,
        LAST_USED_BUFFER_KEY,
        `${orgId}:${keyId}`,
        JSON.stringify({ at: at.toISOString(), ip }),
        String(LAST_USED_BUFFER_TTL_SECONDS),
      )
    } catch (error) {
      this.deps.logger.warn({ err: error }, 'api key use not recorded')
    }
  }

  /** Writes the buffered uses to the table; returns how many keys were updated. */
  async flush(): Promise<number> {
    const raw = await this.deps.client.eval(TAKE_SCRIPT, 1, LAST_USED_BUFFER_KEY)
    const entries = toEntries(Array.isArray(raw) ? raw : [])
    let updated = 0
    for (let start = 0; start < entries.length; start += FLUSH_BATCH) {
      const batch = entries.slice(start, start + FLUSH_BATCH)
      updated += await this.deps.db.system(SYSTEM_REASON, (tx) =>
        this.deps.repository.writeLastUsed(tx, batch),
      )
    }
    return updated
  }
}

/** `HGETALL` answers a flat `[field, value, field, value, …]`; malformed items are dropped. */
function toEntries(flat: readonly unknown[]): LastUsedEntry[] {
  const entries: LastUsedEntry[] = []
  for (let index = 0; index + 1 < flat.length; index += 2) {
    const member = MEMBER_PATTERN.exec(String(flat[index]))
    if (member === null) continue
    let parsed: z.infer<typeof bufferedUseSchema>
    try {
      parsed = bufferedUseSchema.parse(JSON.parse(String(flat[index + 1])))
    } catch {
      continue
    }
    entries.push({
      orgId: member[1] ?? '',
      keyId: member[2] ?? '',
      at: new Date(parsed.at),
      ip: parsed.ip,
    })
  }
  return entries
}
