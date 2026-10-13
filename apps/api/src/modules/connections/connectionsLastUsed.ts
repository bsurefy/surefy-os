// SPDX-License-Identifier: AGPL-3.0-only
import { z } from 'zod'

import {
  FLUSH_BATCH,
  LAST_USED_BUFFER_KEY,
  LAST_USED_BUFFER_TTL_SECONDS,
  SYSTEM_REASON,
} from './connections.constants.js'

import type { ConnectionsRepository, LastUsedEntry } from './connections.repository.js'
import type { CacheClient } from '@/core/cache/index.js'
import type { Database } from '@/core/database/index.js'
import type { Logger } from '@/core/logger/index.js'

// Writing `last_used_at` on every call would turn each tool call into a write. A use is noted in
// one Redis hash instead; the `connectionsFlushLastUsed` job writes the hash to the table every
// few minutes (database/bridge-and-connections.md, §1).

const RECORD_SCRIPT = `
redis.call('HSET', KEYS[1], ARGV[1], ARGV[2])
redis.call('EXPIRE', KEYS[1], ARGV[3])
return 1`

// Reads and clears the hash in one step, so a use noted meanwhile starts the next batch.
const TAKE_SCRIPT = `
local entries = redis.call('HGETALL', KEYS[1])
redis.call('DEL', KEYS[1])
return entries`

const bufferedUseSchema = z.object({ at: z.iso.datetime() })
const MEMBER_PATTERN = /^([0-9a-f-]{36}):([0-9a-f-]{36})$/

export interface ConnectionsLastUsedDeps {
  client: Pick<CacheClient, 'eval'>
  db: Database
  repository: ConnectionsRepository
  logger: Logger
}

export class ConnectionsLastUsed {
  constructor(private readonly deps: ConnectionsLastUsedDeps) {}

  /** A failure never fails the call: `last_used_at` is best effort and may lag. */
  async record(orgId: string, connectionId: string, at = new Date()): Promise<void> {
    try {
      await this.deps.client.eval(
        RECORD_SCRIPT,
        1,
        LAST_USED_BUFFER_KEY,
        `${orgId}:${connectionId}`,
        JSON.stringify({ at: at.toISOString() }),
        String(LAST_USED_BUFFER_TTL_SECONDS),
      )
    } catch (error) {
      this.deps.logger.warn({ err: error }, 'connection use not recorded')
    }
  }

  /** Writes the buffered uses to the table; returns how many connections were updated. */
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
      connectionId: member[2] ?? '',
      at: new Date(parsed.at),
    })
  }
  return entries
}
