// SPDX-License-Identifier: AGPL-3.0-only
import { orgKey } from '@/core/cache/index.js'
import type { BudgetScope } from '@surefy/contracts'

import { BUDGET_COUNTER_GRACE_DAYS } from './budgets.constants.js'
import { nextMonth, yyyymm } from './budgets.utils.js'

import type { Cache } from '@/core/cache/index.js'

/** One live spend counter: a budget scope in one currency and UTC month. */
export interface SpendCounter {
  orgId: string
  /** First day of the UTC month. */
  month: string
  currency: string
  scope: BudgetScope
  scopeId: string
}

/** `org:{orgId}:spend:{yyyymm}:{currency}:{scope}:{scopeId}` */
export const spendCounterKey = (counter: SpendCounter): string =>
  orgKey(
    counter.orgId,
    'spend',
    yyyymm(counter.month),
    counter.currency,
    counter.scope,
    counter.scopeId,
  )

/** Unix seconds: 7 days after the month ends. */
const expiresAt = (month: string): number =>
  Math.floor(Date.parse(`${nextMonth(month)}T00:00:00Z`) / 1000) +
  BUDGET_COUNTER_GRACE_DAYS * 86_400

// Adds to the counters that exist and returns old and new values per key (-1, -1 when missing).
// A missing counter is never created here, so a counter is never partial: the next check seeds it.
const INCREMENT_SCRIPT = `
local add = tonumber(ARGV[1])
local out = {}
for i, key in ipairs(KEYS) do
  if redis.call('EXISTS', key) == 1 then
    local old = tonumber(redis.call('GET', key))
    local new = redis.call('INCRBY', key, add)
    out[#out + 1] = old
    out[#out + 1] = new
  else
    out[#out + 1] = -1
    out[#out + 1] = -1
  end
end
return out
`

// Raises an existing counter to the authoritative value, never lowering it; keeps its expiry.
const RAISE_SCRIPT = `
if redis.call('EXISTS', KEYS[1]) == 0 then return -1 end
local current = tonumber(redis.call('GET', KEYS[1]))
local value = tonumber(ARGV[1])
if current < value then
  redis.call('SET', KEYS[1], value, 'KEEPTTL')
  return value
end
return current
`

/**
 * The live spend counters the model gateway checks budgets against (usage-budgets-and-audit.md,
 * "Live budget enforcement"). Postgres is the source of truth: a missing counter is seeded from it
 * with `SET … NX`, and the hourly rollup raises counters that lost increments.
 */
export class BudgetCounters {
  constructor(private readonly cache: Cache) {}

  /** The counter's value; null when it does not exist yet. */
  async read(counter: SpendCounter): Promise<number | null> {
    const raw = await this.cache.client.get(spendCounterKey(counter))
    return raw === null ? null : Number(raw)
  }

  /** Seeds a missing counter; returns the value it holds afterwards (a racing seed wins). */
  async seed(counter: SpendCounter, value: number): Promise<number> {
    const key = spendCounterKey(counter)
    const set = await this.cache.client.set(
      key,
      String(value),
      'EXAT',
      expiresAt(counter.month),
      'NX',
    )
    if (set === 'OK') return value
    const raw = await this.cache.client.get(key)
    return raw === null ? value : Number(raw)
  }

  /** Adds committed spend to the counters that exist; old and new values per counter. */
  async increment(
    counters: readonly SpendCounter[],
    amountMicros: number,
  ): Promise<({ before: number; after: number } | null)[]> {
    if (counters.length === 0 || amountMicros <= 0) return counters.map(() => null)
    const result = (await this.cache.client.eval(
      INCREMENT_SCRIPT,
      counters.length,
      ...counters.map(spendCounterKey),
      String(amountMicros),
    )) as number[]
    return counters.map((_, i) => {
      const before = Number(result[i * 2])
      const after = Number(result[i * 2 + 1])
      return before < 0 ? null : { before, after }
    })
  }

  /** Raises an existing counter to the authoritative spend (reconciliation). */
  async raise(counter: SpendCounter, value: number): Promise<void> {
    await this.cache.client.eval(RAISE_SCRIPT, 1, spendCounterKey(counter), String(value))
  }
}
