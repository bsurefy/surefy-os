// SPDX-License-Identifier: AGPL-3.0-only
import {
  AGENT_RUN_MAX_SECONDS,
  AGENT_RUN_STALE_MINUTES,
  AGENT_RUNS_ERROR_CODES,
} from '@surefy/contracts'

import { QUEUED_STALE_MINUTES, SWEEP_BATCH, SWEEP_REASON } from './agentRuns.constants.js'
import { stretchExceeded, stretchStart } from './agentRuns.state.js'

import type { RunLifecycle } from './agentRuns.lifecycle.js'
import type { AgentRunsRepository } from './agentRuns.repository.js'
import type { RunResumer } from './agentRuns.resume.js'
import type { AgentRunsDispatcher } from './agentRuns.types.js'
import type { Database } from '@/core/database/index.js'
import type { Logger } from '@/core/logger/index.js'

export interface SweeperDeps {
  db: Database
  repository: AgentRunsRepository
  lifecycle: RunLifecycle
  resumer: RunResumer
  dispatcher: AgentRunsDispatcher
  logger: Logger
  now?: () => Date
}

export interface SweepResult {
  requeued: number
  timedOut: number
  resumed: number
}

/**
 * The `agent-run-sweeper` (backend/agent-runs.md, §7), every minute: it re-enqueues runs whose
 * executor is gone (the claim makes a duplicate harmless), ends runs past the duration limit and
 * resumes runs whose approvals were all decided while the resume event was lost.
 */
export class AgentRunSweeper {
  private readonly now: () => Date

  constructor(private readonly deps: SweeperDeps) {
    this.now = deps.now ?? (() => new Date())
  }

  async run(): Promise<SweepResult> {
    const now = this.now()
    const queuedBefore = new Date(now.getTime() - QUEUED_STALE_MINUTES * 60_000)
    const staleBefore = new Date(now.getTime() - AGENT_RUN_STALE_MINUTES * 60_000)
    const stretchBefore = new Date(now.getTime() - AGENT_RUN_MAX_SECONDS * 1000)
    const found = await this.deps.db.system(SWEEP_REASON, async (tx) => ({
      stuck: await this.deps.repository.stuck(tx, queuedBefore, staleBefore, SWEEP_BATCH),
      long: await this.deps.repository.runningSince(tx, stretchBefore, SWEEP_BATCH),
      waiting: await this.deps.repository.waiting(tx, SWEEP_BATCH),
    }))

    // the minute bucket keeps a run from being enqueued twice in one pass of two sweepers
    const bucket = Math.floor(now.getTime() / 60_000)
    for (const run of found.stuck) {
      await this.deps.dispatcher.execute(
        run.organizationId,
        run.id,
        `agent-run-${run.id}-sweep-${bucket}`,
      )
    }

    let timedOut = 0
    for (const run of found.long) {
      if (await this.timeOutIfExpired(run.organizationId, run.id, now)) timedOut += 1
    }

    let resumed = 0
    for (const run of found.waiting) {
      if (await this.deps.resumer.resumeIfReady(run.organizationId, run.id)) resumed += 1
    }
    const result = { requeued: found.stuck.length, timedOut, resumed }
    if (result.requeued + result.timedOut + result.resumed > 0) {
      this.deps.logger.info(result, 'agent run sweeper')
    }
    return result
  }

  /** A stretch of active execution that passed the limit ends the run `timed_out`. */
  private async timeOutIfExpired(orgId: string, runId: string, now: Date): Promise<boolean> {
    const state = await this.deps.db.tenant(orgId, async (tx) => {
      const run = await this.deps.repository.findRun(tx, orgId, runId)
      if (run?.status !== 'running') return
      const steps = await this.deps.repository.listSteps(tx, orgId, run)
      return { stretchStartedAt: stretchStart(run, steps) }
    })
    if (state === undefined || !stretchExceeded(state, now)) return false
    const ended = await this.deps.lifecycle.end({
      orgId,
      runId,
      from: ['running'],
      status: 'timed_out',
      errorCode: AGENT_RUNS_ERROR_CODES.AGENT_RUN_TIMED_OUT,
    })
    return ended !== undefined
  }
}
