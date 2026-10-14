// SPDX-License-Identifier: AGPL-3.0-only
import { AGENT_RUN_AUDIT_ACTIONS } from '@surefy/contracts'
import type { AgentRunStatus } from '@surefy/contracts'

import { outcomeSentence, summarize } from './agentRuns.summary.js'

import type { AgentRunsRepository } from './agentRuns.repository.js'
import type {
  AgentRunsApprovals,
  AgentRunsChatAnswers,
  AgentRunsEvents,
  AgentRunsOutbox,
  RunRow,
} from './agentRuns.types.js'
import type { Database } from '@/core/database/index.js'
import type { AuditContext, AuditRecorder } from '@/modules/audit/index.js'

export interface LifecycleDeps {
  db: Database
  repository: AgentRunsRepository
  approvals: AgentRunsApprovals
  audit: AuditRecorder
  outbox: AgentRunsOutbox
  events: AgentRunsEvents
  chatAnswers: AgentRunsChatAnswers
}

export type EndStatus = Extract<AgentRunStatus, 'succeeded' | 'failed' | 'canceled' | 'timed_out'>

export interface EndRequest {
  orgId: string
  runId: string
  /** The statuses the run may be ended from. */
  from: readonly AgentRunStatus[]
  status: EndStatus
  errorCode?: string | null
  /** Who ended it: the person who canceled; the system otherwise. */
  actor?: AuditContext
}

/**
 * Ending a run (backend/agent-runs.md, §7): one conditional update, and in the same transaction
 * the run's pending approvals are canceled, the summary is written, a chat run's answer is
 * written and `agent_run.finished` is put in the outbox. The caller that gets the row owns the follow-up; the others do nothing, so
 * a cancel, a timeout and the executor can race safely.
 */
export class RunLifecycle {
  constructor(private readonly deps: LifecycleDeps) {}

  /** The ended run, or undefined when it had already ended. */
  async end(request: EndRequest): Promise<RunRow | undefined> {
    const { orgId, runId } = request
    const ended = await this.deps.db.tenant(orgId, async (tx) => {
      const current = await this.deps.repository.findRun(tx, orgId, runId)
      if (current === undefined) return
      const steps = await this.deps.repository.listSteps(tx, orgId, current)
      const errorCode = request.errorCode ?? null
      const row = await this.deps.repository.finish(tx, orgId, runId, request.from, {
        status: request.status,
        errorCode,
        summary: summarize(steps, outcomeSentence(request.status, errorCode, steps)),
      })
      if (row === undefined) return
      const context = request.actor ?? { orgId, userId: null, via: 'system' as const }
      await this.deps.approvals.cancelPending(
        tx,
        { orgId, userId: null, via: 'system', teamIds: [], access: { permissions: [] } },
        { agentRunId: runId },
      )
      if (row.trigger === 'chat') await this.deps.chatAnswers.finished(tx, row, steps)
      await this.deps.outbox.write(tx, {
        orgId,
        topic: 'agent_run.finished',
        payload: { version: 1, id: runId, status: request.status },
        dedupeKey: `agent_run.finished:${runId}`,
        ...(context.requestId === undefined ? {} : { requestId: context.requestId }),
      })
      if (request.status === 'canceled') {
        await this.deps.audit.record(tx, context, {
          action: AGENT_RUN_AUDIT_ACTIONS.AGENT_RUN_CANCELED,
          target: { type: 'agent_run', id: runId },
          metadata: { labels: { trigger: row.trigger } },
        })
      }
      return row
    })
    if (ended === undefined) return undefined
    await this.deps.outbox.kick()
    await this.announce(ended)
    return ended
  }

  /** The final events of the stream: the status, the failure if there was one, `finish`. */
  async announce(run: RunRow): Promise<void> {
    const { events } = this.deps
    await events.publish(run.organizationId, run.id, {
      type: 'data-run',
      data: { runId: run.id, status: run.status, errorCode: run.errorCode },
    })
    if (run.errorCode !== null) {
      await events.publish(run.organizationId, run.id, { type: 'error', errorText: run.errorCode })
    }
    await events.publish(run.organizationId, run.id, { type: 'finish' })
  }
}
