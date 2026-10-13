// SPDX-License-Identifier: AGPL-3.0-only
import { outboxHandler } from '@/modules/outbox/index.js'

import type { RunResumer } from './agentRuns.resume.js'
import type { Logger } from '@/core/logger/index.js'

/**
 * The run engine's outbox handlers. A decided or expired approval continues its run (delivery is
 * at least once: the conditional update lets only one delivery start the job); a finished run is
 * logged with its status, the line the run metrics count.
 */
export function createAgentRunHandlers(deps: { resumer: RunResumer; logger: Logger }) {
  return [
    outboxHandler('approval.decided', 'agent-runs.resume-decided', async (delivery) => {
      if (delivery.orgId === null) return
      await deps.resumer.onApprovalSettled(delivery.orgId, delivery.payload.id)
    }),
    outboxHandler('approval.expired', 'agent-runs.resume-expired', async (delivery) => {
      if (delivery.orgId === null) return
      await deps.resumer.onApprovalSettled(delivery.orgId, delivery.payload.id)
    }),
    outboxHandler('agent_run.finished', 'agent-runs.log-finished', (delivery) => {
      deps.logger.info(
        { orgId: delivery.orgId, runId: delivery.payload.id, status: delivery.payload.status },
        'agent run finished',
      )
      return Promise.resolve()
    }),
  ]
}
