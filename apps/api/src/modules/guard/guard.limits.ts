// SPDX-License-Identifier: AGPL-3.0-only
import { LIMIT_COUNTER_TTL_SECONDS, limitCounterKey } from './guard.constants.js'

import type { Cache } from '@/core/cache/index.js'

/** What one action-limit rule bounds per day; absent = not bounded. */
export interface DailyLimit {
  perDayCount?: number
  perDayAmountMicros?: number
}

/** `yyyymmdd`, UTC. */
export const limitDay = (at: Date): string => at.toISOString().slice(0, 10).replaceAll('-', '')

// Checks both bounds and counts the action in one step, so two actions at once cannot both take
// the last place. -1 means "not bounded".
const RESERVE_SCRIPT = `
local count = tonumber(redis.call('GET', KEYS[1]) or '0')
local amount = tonumber(redis.call('GET', KEYS[2]) or '0')
local maxCount = tonumber(ARGV[1])
local maxAmount = tonumber(ARGV[2])
local add = tonumber(ARGV[3])
if maxCount >= 0 and count + 1 > maxCount then return 0 end
if maxAmount >= 0 and amount + add > maxAmount then return 0 end
redis.call('INCR', KEYS[1])
redis.call('INCRBY', KEYS[2], add)
redis.call('EXPIRE', KEYS[1], ARGV[4])
redis.call('EXPIRE', KEYS[2], ARGV[4])
return 1
`

/**
 * The per-day counters of the action limits, in Redis under
 * `org:{orgId}:guard:limit:{ruleRef}:{yyyymmdd}` (the count) and `…:amount`. Reading is free of
 * side effects; reserving checks and counts together. A Redis failure is not swallowed: a limit
 * that cannot be read is not a limit that holds.
 */
export class LimitCounters {
  constructor(private readonly cache: Cache) {}

  /** What the rule counted today, without counting anything. */
  async read(
    orgId: string,
    ruleRef: string,
    day: string,
  ): Promise<{ count: number; amount: number }> {
    const key = limitCounterKey(orgId, ruleRef, day)
    const [count, amount] = await Promise.all([
      this.cache.client.get(key),
      this.cache.client.get(`${key}:amount`),
    ])
    return { count: Number(count ?? 0), amount: Number(amount ?? 0) }
  }

  /** Counts the action when both bounds still hold; false when one is reached. */
  async reserve(
    orgId: string,
    ruleRef: string,
    day: string,
    limit: DailyLimit,
    amountMicros: number,
  ): Promise<boolean> {
    const key = limitCounterKey(orgId, ruleRef, day)
    const result = await this.cache.client.eval(
      RESERVE_SCRIPT,
      2,
      key,
      `${key}:amount`,
      String(limit.perDayCount ?? -1),
      String(limit.perDayAmountMicros ?? -1),
      String(amountMicros),
      String(LIMIT_COUNTER_TTL_SECONDS),
    )
    return Number(result) === 1
  }
}
