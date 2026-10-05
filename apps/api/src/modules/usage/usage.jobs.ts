// SPDX-License-Identifier: AGPL-3.0-only
import { z } from 'zod'

import { QUEUES } from '@/constants/queues.js'
import { defineJob } from '@/core/queue/index.js'

import { USAGE_JOBS } from './usage.constants.js'

import type { UsageRollupService } from './usageRollup.service.js'

/**
 * `usage` / `aggregateUsage`: schedulers `aggregate-usage-hourly` (mode `hourly`) and
 * `recompute-usage-nightly` (mode `nightly`). A failed run keeps the watermark; the retry and
 * the next run recompute the same days.
 */
export const createAggregateUsageJob = (rollup: UsageRollupService) =>
  defineJob({
    queue: QUEUES.USAGE,
    name: USAGE_JOBS.AGGREGATE,
    schema: z.object({ mode: z.enum(['hourly', 'nightly']).default('hourly') }),
    options: { attempts: 3, backoff: { type: 'exponential', delay: 60_000 } },
    process:
      (runtime) =>
      async ({ mode }) => {
        runtime.logger.info(await rollup.aggregate(mode), 'usage aggregated')
      },
  })
