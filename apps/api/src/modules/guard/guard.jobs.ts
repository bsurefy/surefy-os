// SPDX-License-Identifier: AGPL-3.0-only
import { z } from 'zod'

import { QUEUES } from '@/constants/queues.js'
import { defineJob } from '@/core/queue/index.js'

import { GUARD_JOBS } from './guard.constants.js'

import type { GuardStats } from './guard.stats.js'

/**
 * `maintenance` / `guardStatsRollup` (schedulers `guard-stats-hourly` and `guard-stats-nightly`):
 * rebuilds the recent days of `guard_stats_daily`. A failed run is retried; the next scheduled run
 * recomputes the same days anyway.
 */
export const createStatsRollupJob = (stats: GuardStats) =>
  defineJob({
    queue: QUEUES.MAINTENANCE,
    name: GUARD_JOBS.STATS_ROLLUP,
    schema: z.object({ mode: z.enum(['hourly', 'nightly']).default('hourly') }),
    options: { attempts: 3, backoff: { type: 'exponential', delay: 60_000 } },
    process:
      (runtime) =>
      async ({ mode }) => {
        runtime.logger.info(await stats.rollup(mode), 'guard stats rebuilt')
      },
  })
