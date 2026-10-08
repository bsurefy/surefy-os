// SPDX-License-Identifier: AGPL-3.0-only
import { STATS_HOURLY_DAYS, STATS_NIGHTLY_DAYS, STATS_REASON } from './guard.constants.js'

import type { GuardRepository } from './guard.repository.js'
import type { GuardSubjects } from './guard.types.js'
import type { Database } from '@/core/database/index.js'

export interface GuardStatsDeps {
  db: Database
  repository: GuardRepository
  subjects: GuardSubjects
  /** The clock; tests pass a fixed one. */
  now?: () => Date
}

export type GuardStatsMode = 'hourly' | 'nightly'

const DAY_MS = 86_400_000

/** `2026-10-08` for a date, UTC. */
const utcDay = (at: Date): string => at.toISOString().slice(0, 10)

/**
 * `guard_stats_daily` (usage-budgets-and-audit.md, §9): each UTC day of the window is rebuilt from
 * the approvals, the usage events and the checked steps in its own transaction, so readers see
 * the old or the new rows of a day. The hourly run covers today and yesterday, the nightly run
 * the last week; a failed run changes nothing and the next one recomputes the same days.
 */
export class GuardStats {
  constructor(private readonly deps: GuardStatsDeps) {}

  async rollup(mode: GuardStatsMode): Promise<{ mode: GuardStatsMode; days: number }> {
    const now = (this.deps.now ?? (() => new Date()))()
    const count = mode === 'hourly' ? STATS_HOURLY_DAYS : STATS_NIGHTLY_DAYS
    const days = Array.from({ length: count }, (_, back) =>
      utcDay(new Date(now.getTime() - back * DAY_MS)),
    )
    for (const day of days.toReversed()) {
      await this.deps.db.system(STATS_REASON, async (tx) => {
        const actions = await this.deps.subjects.actionCounts(tx, day)
        await this.deps.repository.recomputeDay(tx, day, actions)
      })
    }
    return { mode, days: days.length }
  }
}
