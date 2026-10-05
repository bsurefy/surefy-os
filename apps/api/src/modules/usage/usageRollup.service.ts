// SPDX-License-Identifier: AGPL-3.0-only
import {
  HOURLY_LOOKBACK_MS,
  NIGHTLY_LOOKBACK_DAYS,
  ROLLUP_LAG_MS,
  USAGE_WATERMARK_CACHE_KEY,
  USAGE_WATERMARK_TTL_SECONDS,
} from './usage.constants.js'
import { daysBetween, monthOf, utcDay } from './usage.utils.js'

import type { UsageRepository } from './usage.repository.js'
import type { Cache } from '@/core/cache/index.js'
import type { Database } from '@/core/database/index.js'
import type { UsageRollup } from '@/database/tables/index.js'

export interface UsageRollupDeps {
  db: Database
  cache: Cache
  repository: UsageRepository
  now?: () => Date
}

export type RollupMode = 'hourly' | 'nightly'

export interface RollupResult {
  mode: RollupMode
  days: number
  months: number
  watermark: string | null
}

/** The rollups this module maintains; run and Guard stats join with their V1 modules. */
const ROLLUPS: readonly UsageRollup[] = ['usage_daily', 'usage_monthly']
const DAY_MS = 86_400_000
const REASON = 'usage-aggregation'

/**
 * `aggregateUsage` (usage-budgets-and-audit.md, "Rollup maintenance"): rebuilds each UTC day of
 * the window from the events, then each month the window touches, then moves the watermark. The
 * hourly run covers the watermark minus 48 hours up to now; the nightly run the last 7 days. A
 * failed run keeps the old watermark and the next run recomputes the same days.
 */
export class UsageRollupService {
  private readonly now: () => Date

  constructor(private readonly deps: UsageRollupDeps) {
    this.now = deps.now ?? (() => new Date())
  }

  async aggregate(mode: RollupMode): Promise<RollupResult> {
    const { db, repository } = this.deps
    const runStarted = this.now()
    const newWatermark = new Date(runStarted.getTime() - ROLLUP_LAG_MS)
    if (mode === 'hourly') await db.system(REASON, (tx) => repository.markStarted(tx, ROLLUPS))
    try {
      const firstDay = await this.windowStart(mode, runStarted)
      const days = firstDay === null ? [] : daysBetween(firstDay, utcDay(runStarted))
      for (const day of days) {
        await db.system(REASON, (tx) => repository.recomputeDay(tx, day))
      }
      const months = [...new Set(days.map(monthOf))]
      for (const month of months) {
        await db.system(REASON, (tx) => repository.recomputeMonth(tx, month))
      }
      await db.system(REASON, (tx) => repository.markFinished(tx, ROLLUPS, mode, newWatermark))
      if (mode === 'hourly') {
        // requests may not read the system-only state row: Insights reads this copy
        const current = await db.system(REASON, (tx) => repository.watermark(tx, 'usage_daily'))
        if (current !== null) {
          await this.deps.cache.set(
            USAGE_WATERMARK_CACHE_KEY,
            current.toISOString(),
            USAGE_WATERMARK_TTL_SECONDS,
          )
        }
      }
      return {
        mode,
        days: days.length,
        months: months.length,
        watermark: mode === 'hourly' ? newWatermark.toISOString() : null,
      }
    } catch (error) {
      const code = error instanceof Error && 'code' in error ? String(error.code) : 'ROLLUP_FAILED'
      await db.system(REASON, (tx) => repository.markFailed(tx, ROLLUPS, code))
      throw error
    }
  }

  /** The first UTC day to rebuild, or null when there is nothing to aggregate yet. */
  private async windowStart(mode: RollupMode, runStarted: Date): Promise<string | null> {
    if (mode === 'nightly') {
      return utcDay(new Date(runStarted.getTime() - NIGHTLY_LOOKBACK_DAYS * DAY_MS))
    }
    const { db, repository } = this.deps
    const watermark = await db.system(REASON, (tx) => repository.watermark(tx, 'usage_daily'))
    if (watermark === null) return db.system(REASON, (tx) => repository.firstEventDay(tx))
    return utcDay(new Date(watermark.getTime() - HOURLY_LOOKBACK_MS))
  }
}
