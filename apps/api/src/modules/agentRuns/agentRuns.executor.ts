// SPDX-License-Identifier: AGPL-3.0-only
import { AGENT_RUN_HEARTBEAT_MS, AGENT_RUNS_ERROR_CODES, ERROR_CODES } from '@surefy/contracts'

import { HEARTBEAT_LIVE_MS } from './agentRuns.constants.js'
import { AgentRunSupersededError, RunFailure } from './agentRuns.errors.js'
import { failureCodeOf } from './agentRuns.failure.js'
import { nextMove } from './agentRuns.moves.js'
import { openSession } from './agentRuns.session.js'
import { deriveState, resolutionRow } from './agentRuns.state.js'

import type { CallMoves } from './agentRuns.calls.js'
import type { RunLifecycle } from './agentRuns.lifecycle.js'
import type { Move } from './agentRuns.moves.js'
import type { AgentRunsRepository } from './agentRuns.repository.js'
import type { RunSession } from './agentRuns.session.js'
import type { RunState } from './agentRuns.state.js'
import type { ModelTurns } from './agentRuns.turns.js'
import type {
  AgentRunsAgents,
  AgentRunsApprovals,
  AgentRunsEvents,
  AgentRunsPeople,
  RunRow,
  StepRow,
} from './agentRuns.types.js'
import type { Database } from '@/core/database/index.js'
import type { Logger } from '@/core/logger/index.js'

export interface ExecutorDeps {
  db: Database
  repository: AgentRunsRepository
  lifecycle: RunLifecycle
  events: AgentRunsEvents
  agents: AgentRunsAgents
  people: AgentRunsPeople
  approvals: AgentRunsApprovals
  turns: ModelTurns
  calls: CallMoves
  logger: Logger
  now?: () => Date
  /** The heartbeat interval; tests shorten it. */
  heartbeatMs?: number
}

export interface ExecutePayload {
  orgId: string
  runId: string
  /** Set on a resume job: the run was just taken back from `waiting_approval`. */
  approvalId?: string
}

export interface AttemptInfo {
  /** The last attempt BullMQ makes: a failure now ends the run instead of leaving it open. */
  final: boolean
}

interface Claim {
  run: RunRow
  /** The first time the run started executing. */
  first: boolean
}

/**
 * The agent loop (backend/agent-runs.md, §4): claims a run, then does one move at a time, each
 * persisted before the next. Every move is derived from the steps in Postgres, so a worker that
 * takes over after a crash, a resume after an approval and a retried job all continue from the
 * same place. The loop runs in the worker only.
 */
export class AgentRunExecutor {
  private readonly now: () => Date

  constructor(private readonly deps: ExecutorDeps) {
    this.now = deps.now ?? (() => new Date())
  }

  async execute(payload: ExecutePayload, attempt: AttemptInfo): Promise<void> {
    const { orgId, runId } = payload
    const claim = await this.claim(payload)
    if (claim === undefined) return
    const controller = new AbortController()
    const beat = setInterval(() => {
      void this.beat(orgId, runId, controller)
    }, this.deps.heartbeatMs ?? AGENT_RUN_HEARTBEAT_MS)
    let session: RunSession | undefined
    try {
      const steps = await this.deps.db.tenant(orgId, (tx) =>
        this.deps.repository.listSteps(tx, orgId, claim.run),
      )
      const opened = await openSession(
        { db: this.deps.db, agents: this.deps.agents, people: this.deps.people },
        claim.run,
        steps,
        controller.signal,
      )
      if (!opened.ok) {
        await this.deps.lifecycle.end({
          orgId,
          runId,
          from: ['running'],
          status: 'failed',
          errorCode: opened.errorCode,
        })
        return
      }
      session = opened.session
      if (claim.first) {
        await this.deps.events.publish(orgId, runId, { type: 'start', messageId: runId })
      }
      await this.deps.events.publish(orgId, runId, {
        type: 'data-run',
        data: { runId, status: 'running', errorCode: null },
      })
      await this.loop(session)
    } catch (error) {
      await this.failed(orgId, runId, error, controller, attempt)
    } finally {
      clearInterval(beat)
    }
  }

  // ---- Claim and heartbeat ------------------------------------------------------------------

  /**
   * `queued` becomes `running` (`started_at` the first time). A `running` run is taken over when
   * its heartbeat is stale (its executor died) or this is the resume job the approval started.
   * A run another executor holds, or that is waiting, canceled or finished, is left alone.
   */
  private async claim(payload: ExecutePayload): Promise<Claim | undefined> {
    const { orgId, runId } = payload
    return this.deps.db.tenant(orgId, async (tx) => {
      const run = await this.deps.repository.lockRun(tx, orgId, runId)
      if (run === undefined) return
      if (run.status === 'running') {
        const alive = this.now().getTime() - run.updatedAt.getTime() < HEARTBEAT_LIVE_MS
        if (alive && payload.approvalId === undefined) return
      } else if (run.status !== 'queued') {
        return
      }
      const claimed = await this.deps.repository.markRunning(tx, orgId, runId)
      return claimed === undefined ? undefined : { run: claimed, first: run.startedAt === null }
    })
  }

  /** Refreshes the heartbeat; a run that is no longer `running` (a cancel, a timeout) aborts the executor. */
  private async beat(orgId: string, runId: string, controller: AbortController): Promise<void> {
    try {
      const status = await this.deps.db.tenant(orgId, (tx) =>
        this.deps.repository.heartbeat(tx, orgId, runId),
      )
      if (status !== 'running') controller.abort()
    } catch (error) {
      this.deps.logger.warn({ err: error, orgId, runId }, 'agent run heartbeat failed')
    }
  }

  // ---- The loop -----------------------------------------------------------------------------

  private async loop(session: RunSession): Promise<void> {
    for (;;) {
      if (session.signal.aborted) return
      const snapshot = await this.snapshot(session)
      if (snapshot === undefined) return
      const { state, decided } = snapshot
      const tools = await this.deps.turns.toolsOf(session)
      const move = nextMove({
        state,
        definition: session.definition,
        tools,
        decided,
        now: this.now(),
      })
      if (await this.perform(session, state, move)) return
    }
  }

  /** Does one move. Returns true when the run ended, paused or has nothing left to do here. */
  private async perform(session: RunSession, state: RunState, move: Move): Promise<boolean> {
    switch (move.kind) {
      case 'timeout':
        await this.end(session, 'timed_out', AGENT_RUNS_ERROR_CODES.AGENT_RUN_TIMED_OUT)
        return true
      case 'turn_limit':
        await this.end(session, 'failed', AGENT_RUNS_ERROR_CODES.AGENT_RUN_TURN_LIMIT)
        return true
      case 'succeed':
        await this.end(session, 'succeeded', null)
        return true
      case 'retrieve':
        await this.deps.turns.retrieve(session, state)
        return false
      case 'model':
        await this.deps.turns.modelTurn(session, state)
        return false
      case 'request_approvals':
        return (await this.deps.calls.requestApprovals(session, state, move.calls)).paused
      case 'wait':
        if (move.approvalIds.length === 0) throw new Error('agent run has no next move')
        return (await this.deps.calls.pause(session, move.approvalIds)).paused
      case 'call':
        await this.performCall(session, state, move)
        return false
    }
  }

  private async performCall(
    session: RunSession,
    state: RunState,
    move: Extract<Move, { kind: 'call' }>,
  ): Promise<void> {
    const { call, tool } = move
    const calls = this.deps.calls
    switch (move.need) {
      case 'decide':
        if (tool !== undefined) await calls.decide(session, state, call, tool)
        break
      case 'guard':
        if (tool !== undefined) await calls.check(session, state, call, tool)
        break
      case 'execute':
        if (tool !== undefined) await calls.execute(session, state, call, tool)
        break
      case 'record_blocked':
        await calls.skip(session, state, call, skipReason(move))
        break
      case 'record_rejected':
        await calls.skip(session, state, call, 'rejected')
        break
      case 'resolve_approval':
        await calls.resolve(session, state, call, tool)
        break
    }
  }

  /** The run and its steps as they are now, and which of the approvals a person has decided. */
  private async snapshot(
    session: RunSession,
  ): Promise<{ run: RunRow; state: RunState; decided: Set<string> } | undefined> {
    const { orgId, runId } = session
    return this.deps.db.tenant(orgId, async (tx) => {
      const run = await this.deps.repository.findRun(tx, orgId, runId)
      if (run?.status !== 'running') return
      const steps: StepRow[] = await this.deps.repository.listSteps(tx, orgId, run)
      const state = deriveState(run, steps)
      if (state === undefined) throw new RunFailure(ERROR_CODES.VALIDATION_FAILED)
      const waiting = (state.turn?.calls ?? []).flatMap((call) =>
        call.approvalId !== null && call.approvals.length > 0 && resolutionRow(call) === undefined
          ? [call.approvalId]
          : [],
      )
      const decided = new Set<string>()
      if (waiting.length > 0) {
        const resolutions = await this.deps.approvals.resolutionsOf(tx, orgId, waiting)
        for (const [id, resolution] of resolutions) {
          if (resolution.outcome !== 'pending') decided.add(id)
        }
      }
      return { run, state, decided }
    })
  }

  // ---- Ending -------------------------------------------------------------------------------

  private async end(
    session: RunSession,
    status: 'succeeded' | 'failed' | 'timed_out',
    errorCode: string | null,
  ): Promise<void> {
    await this.deps.lifecycle.end({
      orgId: session.orgId,
      runId: session.runId,
      from: ['running'],
      status,
      errorCode,
    })
  }

  /**
   * A move that threw. A superseded run (canceled, timed out, taken over) stops quietly. A model
   * that is down or a budget that ran out is the run's failure and ends it. An infrastructure
   * error is thrown so BullMQ retries; on the last attempt it ends the run instead.
   */
  private async failed(
    orgId: string,
    runId: string,
    error: unknown,
    controller: AbortController,
    attempt: AttemptInfo,
  ): Promise<void> {
    if (error instanceof AgentRunSupersededError || controller.signal.aborted) return
    const code = failureCodeOf(error)
    if (code !== null) {
      // the run keeps only the code; what the provider or the check said goes to the log
      this.deps.logger.warn({ err: error, orgId, runId, errorCode: code }, 'agent run failed')
      await this.deps.lifecycle.end({
        orgId,
        runId,
        from: ['running'],
        status: 'failed',
        errorCode: code,
      })
      return
    }
    this.deps.logger.error({ err: error, orgId, runId }, 'agent run execution failed')
    if (attempt.final) {
      await this.deps.lifecycle.end({
        orgId,
        runId,
        from: ['running'],
        status: 'failed',
        errorCode: ERROR_CODES.INTERNAL_ERROR,
      })
      return
    }
    throw error
  }
}

/** Why a call was not run: one too many, a tool that does not exist, or Guard's block. */
function skipReason(move: Extract<Move, { kind: 'call' }>): 'too_many' | 'unknown' | 'blocked' {
  if (move.extra) return 'too_many'
  return move.tool === undefined ? 'unknown' : 'blocked'
}
