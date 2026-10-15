// SPDX-License-Identifier: AGPL-3.0-only
import { z } from 'zod'

import { QUEUES } from '@/constants/queues.js'
import { defineJob } from '@/core/queue/index.js'

import { BUDGET_JOBS } from './budgets.constants.js'

import type { BudgetAlerts } from './budgetAlerts.js'
import type { BudgetAlertPayload } from './budgetEnforcement.js'

const payloadSchema: z.ZodType<BudgetAlertPayload> = z.object({
  orgId: z.uuid(),
  budgetId: z.uuid(),
  periodStart: z.iso.date(),
  thresholdBp: z.number().int().min(1).max(10_000),
  spentMicros: z.number().int().nonnegative(),
})

/**
 * `usage` / `budgetAlert` (job id `budget-{budgetId}-{yyyymm}-{bp}`): the gateway saw a call's
 * cost cross an alert threshold. Inserts the alert once; a re-run inserts nothing.
 */
export const createBudgetAlertJob = (alerts: () => BudgetAlerts) =>
  defineJob({
    queue: QUEUES.USAGE,
    name: BUDGET_JOBS.ALERT,
    schema: payloadSchema,
    process: (runtime) => async (payload) => {
      const fired = await alerts().fire(payload)
      runtime.logger.info({ ...payload, fired }, 'budget alert')
    },
  })
