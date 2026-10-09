// SPDX-License-Identifier: AGPL-3.0-only
import type { AgentRunsRepository } from './agentRuns.repository.js'
import type { AgentRunsApprovals, AgentRunsDispatcher } from './agentRuns.types.js'
import type { Database } from '@/core/database/index.js'
import type { Logger } from '@/core/logger/index.js'

export interface ResumerDeps {
  db: Database
  repository: AgentRunsRepository
  approvals: AgentRunsApprovals
  dispatcher: AgentRunsDispatcher
  logger: Logger
}

/**
 * Continues a run that waits for people (backend/agent-runs.md, §6). It writes no steps: the
 * executor turns each decided approval into its call's outcome when it runs again, so there is a
 * single writer per run. What it does is the conditional `waiting_approval` to `running` update,
 * once no approval of the run is pending, and only the caller that gets the row starts the job.
 */
export class RunResumer {
  constructor(private readonly deps: ResumerDeps) {}

  /** From `approval.decided` and `approval.expired`; delivery is at least once and unordered. */
  async onApprovalSettled(orgId: string, approvalId: string): Promise<boolean> {
    const found = await this.deps.db.tenant(orgId, async (tx) =>
      (await this.deps.approvals.resolutionsOf(tx, orgId, [approvalId])).get(approvalId),
    )
    if (found?.agentRunId === undefined || found.agentRunId === null) return false
    return this.resumeIfReady(orgId, found.agentRunId, approvalId)
  }

  /**
   * Takes the run back from `waiting_approval` when none of its approvals is pending (an
   * escalated approval stays pending, so the run keeps waiting). Returns whether this call did.
   */
  async resumeIfReady(
    orgId: string,
    runId: string,
    approvalId: string | null = null,
  ): Promise<boolean> {
    const resumed = await this.deps.db.tenant(orgId, async (tx) => {
      const run = await this.deps.repository.findRun(tx, orgId, runId)
      if (run?.status !== 'waiting_approval') return
      const approvals = await this.deps.approvals.resolutionsForRun(tx, orgId, runId)
      if (approvals.some((approval) => approval.outcome === 'pending')) return
      const row = await this.deps.repository.resume(tx, orgId, runId)
      if (row === undefined) return
      const settled = approvalId ?? approvals.find((approval) => approval.decidedAt !== null)?.id
      return { approvalId: settled ?? runId }
    })
    if (resumed === undefined) return false
    await this.deps.dispatcher.execute(
      orgId,
      runId,
      `agent-run-${runId}-resume-${resumed.approvalId}`,
      resumed.approvalId,
    )
    this.deps.logger.info({ orgId, runId }, 'agent run resumed')
    return true
  }
}
