// SPDX-License-Identifier: AGPL-3.0-only
import {
  HOURLY_LOOKBACK_MS,
  NIGHTLY_LOOKBACK_DAYS,
  ROLLUP_LAG_MS,
  USAGE_WATERMARK_CACHE_KEY,
  USAGE_WATERMARK_TTL_SECONDS,
} from './usage.constants.js'
import { daysBetween, monthOf, utcDay } from './usage.utils.js'

import type { RunStatsRepository } from './runStats.repository.js'
import type { UsageRepository } from './usage.repository.js'
import type { Cache } from '@/core/cache/index.js'
import type { Database } from '@/core/database/index.js'
import type { Logger } from '@/core/logger/index.js'
import type { UsageRollup } from '@/database/tables/index.js'

export interface UsageRollupDeps {
  db: Database
  cache: Cache
  logger: Logger
  repository: UsageRepository
  runStats: RunStatsRepository
  /** Step 7: reconciles the live budget counters and pending alerts with the new totals. */
  reconcile?: () => Promise<unknown>
  now?: () => Date
}

export type RollupMode = 'hourly' | 'nightly'

export interface RollupResult {
  mode: RollupMode
  days: number
  months: number
  watermark: string | null
}

/** The rollups this module maintains; Guard stats are the guard module's. */
const ROLLUPS: readonly UsageRollup[] = ['usage_daily', 'usage_monthly', 'run_stats_daily']
const DAY_MS = 86_400_000
const REASON = 'usage-aggregation'

/**
 * `aggregateUsage` (usage-budgets-and-audit.md, "Rollup maintenance"): rebuilds each UTC day of
 * the window from the events and finished runs, then each month the window touches, then moves
 * the watermark and reconciles the budgets. The hourly run covers the watermark minus 48 hours up
 * to now; the nightly run the last 7 days. A failed run keeps the old watermark and the next run
 * recomputes the same days.
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
        await db.system(REASON, async (tx) => {
          await repository.recomputeDay(tx, day)
          // under the same day lock, in the same transaction
          await this.deps.runStats.recomputeDay(tx, day)
        })
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
      await this.reconcile()
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

  /** Budget reconciliation; a failure waits for the next run, the rollup itself succeeded. */
  private async reconcile(): Promise<void> {
    if (this.deps.reconcile === undefined) return
    try {
      await this.deps.reconcile()
    } catch (error) {
      this.deps.logger.warn({ err: error }, 'budget reconciliation failed')
    }
  }

  /**
   * The first UTC day to rebuild, or null when there is nothing to aggregate yet. The oldest
   * watermark decides: a rollup that never ran (`-infinity`) starts at the first event or run.
   */
  private async windowStart(mode: RollupMode, runStarted: Date): Promise<string | null> {
    if (mode === 'nightly') {
      return utcDay(new Date(runStarted.getTime() - NIGHTLY_LOOKBACK_DAYS * DAY_MS))
    }
    const { db, repository, runStats } = this.deps
    return db.system(REASON, async (tx) => {
      const marks: (Date | null)[] = []
      for (const rollup of ROLLUPS) marks.push(await repository.watermark(tx, rollup))
      if (!marks.includes(null)) {
        const oldest = Math.min(...marks.map((mark) => mark?.getTime() ?? 0))
        return utcDay(new Date(oldest - HOURLY_LOOKBACK_MS))
      }
      const firstEvent = await repository.firstEventDay(tx)
      const firstRun = await runStats.firstRunDay(tx)
      if (firstEvent === null || firstRun === null) return firstEvent ?? firstRun
      return firstEvent < firstRun ? firstEvent : firstRun
    })
  }
}
