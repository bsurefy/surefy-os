// SPDX-License-Identifier: AGPL-3.0-only
import { z } from 'zod'

import { QUEUES } from '@/constants/queues.js'
import { defineJob } from '@/core/queue/index.js'

import { APPROVALS_JOBS } from './approvals.constants.js'

import type { ApprovalTimeouts } from './approvals.timeouts.js'

/**
 * `maintenance` / `approvalsTimeouts` (scheduler `approval-timeouts`, every minute): takes the
 * timeout action of approvals whose wait ran out. One attempt: the next run retries.
 */
export const createTimeoutsJob = (timeouts: ApprovalTimeouts) =>
  defineJob({
    queue: QUEUES.MAINTENANCE,
    name: APPROVALS_JOBS.TIMEOUTS,
    schema: z.object({}),
    options: { attempts: 1 },
    process: (runtime) => async () => {
      const run = await timeouts.run()
      if (run.due > 0) runtime.logger.info(run, 'approval timeouts handled')
    },
  })
