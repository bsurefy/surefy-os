// SPDX-License-Identifier: AGPL-3.0-only
import { AGENT_RUN_AUDIT_ACTIONS, AGENT_RUNS_ERROR_CODES } from '@surefy/contracts'
import type { AgentRunStepData } from '@surefy/contracts'

import {
  BLOCKED_RESULT,
  REJECTED_RESULT,
  TOO_MANY_CALLS_RESULT,
  UNKNOWN_TOOL_RESULT,
} from './agentRuns.constants.js'
import { AgentRunSupersededError } from './agentRuns.errors.js'
import { failureCodeOf } from './agentRuns.failure.js'
import { dataLocationOf, piiScopeOf } from './agentRuns.pii.js'
import { argumentsOf } from './agentRuns.state.js'

import type { StepRecorder } from './agentRuns.recorder.js'
import type { AgentRunsRepository } from './agentRuns.repository.js'
import type { RunSession } from './agentRuns.session.js'
import type { CallState, RunState } from './agentRuns.state.js'
import type {
  AgentRunsApprovals,
  AgentRunsEvents,
  AgentRunsGateway,
  AgentRunsGuard,
  AgentRunsPii,
  AgentRunsTools,
} from './agentRuns.types.js'
import type { Database } from '@/core/database/index.js'
import type { Logger } from '@/core/logger/index.js'
import type { ResolvedTool } from '@/modules/agentTools/index.js'
import type { AuditRecorder } from '@/modules/audit/index.js'

export interface CallMovesDeps {
  db: Database
  repository: AgentRunsRepository
  recorder: StepRecorder
  events: AgentRunsEvents
  gateway: AgentRunsGateway
  pii: AgentRunsPii
  guard: AgentRunsGuard
  tools: AgentRunsTools
  approvals: AgentRunsApprovals
  audit: AuditRecorder
  logger: Logger
  now?: () => Date
}

const DECISION_QUESTION =
  'An AI agent is about to run the action below for a user. Is it the right action to take now, ' +
  'given what the user asked? Answer true if it is, false if it is not.'
const DECISION_INPUT_MAX = 20_000

const base = { version: 1, truncated: false } as const

/** How a call that was not run shows in the trace, and the code it carries (Guard's own for a block). */
const SKIP_STATUS = {
  blocked: 'blocked',
  rejected: 'skipped',
  unknown: 'failed',
  too_many: 'failed',
} as const
const SKIP_ERROR = {
  blocked: null,
  rejected: null,
  unknown: AGENT_RUNS_ERROR_CODES.AGENT_TOOL_FAILED,
  too_many: AGENT_RUNS_ERROR_CODES.AGENT_TOOL_FAILED,
} as const

/** Resolves when the signal aborts, so a long tool call stops holding the executor. */
function whenAborted(signal: AbortSignal): Promise<never> {
  return new Promise((_, reject) => {
    const stop = () => {
      reject(new AgentRunSupersededError())
    }
    if (signal.aborted) stop()
    else signal.addEventListener('abort', stop, { once: true })
  })
}

/**
 * The moves of one tool call (backend/agent-runs.md, §4–§6): the decision that gives an action its
 * confidence, Guard's check, running the call, and the approval steps of a call that needs a
 * person. Each move writes exactly one step (or one pause), so a worker that dies between two
 * moves is replaced by one that derives the same next move from the steps.
 */
export class CallMoves {
  private readonly now: () => Date

  constructor(private readonly deps: CallMovesDeps) {
    this.now = deps.now ?? (() => new Date())
  }

  private run(session: RunSession) {
    return { orgId: session.orgId, runId: session.runId }
  }

  private publish(session: RunSession, chunk: { type: string; [key: string]: unknown }) {
    return this.deps.events.publish(session.orgId, session.runId, chunk)
  }

  // ---- Decision -----------------------------------------------------------------------------

  /**
   * How sure the agent is that this action is right: asked of the model, recorded as a `decision`
   * step. The action's arguments and the user's request go through the personal-data filter like
   * any other text a cloud model reads; a blocked or unchecked request is a failed decision.
   */
  async decide(
    session: RunSession,
    state: RunState,
    call: CallState,
    tool: ResolvedTool,
  ): Promise<void> {
    const seq = state.nextSeq
    const startedAt = this.now()
    const question = DECISION_QUESTION
    const lastUser = [...session.input.messages]
      .reverse()
      .find((message) => message.role === 'user')
    const subject = JSON.stringify({
      action: tool.toolName,
      description: tool.description,
      arguments: call.arguments,
      request: lastUser?.text ?? '',
    }).slice(0, DECISION_INPUT_MAX)
    try {
      const scope = piiScopeOf(session)
      const filtered = await this.deps.pii.apply({ ...scope, texts: [subject] })
      const answer = await this.deps.gateway.decide(session.modelContext(seq, filtered.masked), {
        modelKey: session.definition.model.modelKey,
        question,
        input: filtered.texts[0] ?? subject,
        signal: session.signal,
      })
      // a confident "no" is a low confidence that the action is right
      const confidence = answer.value === true ? answer.confidence : 1 - answer.confidence
      await this.deps.recorder.record(this.run(session), seq, {
        type: 'decision',
        name: `Is "${tool.label}" the right action?`,
        status: 'succeeded',
        output: {
          ...base,
          kind: 'decision',
          callId: call.id,
          question,
          value: answer.value,
          reasoning: answer.reasoning,
        },
        modelKey: answer.call.model.modelKey,
        inputTokens: answer.call.usage.inputTokens,
        outputTokens: answer.call.usage.outputTokens,
        costMicros: answer.call.usage.costMicros,
        currency: answer.call.usage.currency,
        confidence,
        dataLocation: dataLocationOf(answer.call.model.source),
        startedAt,
        finishedAt: this.now(),
      })
      await this.publish(session, {
        type: 'data-confidence',
        data: { seq, value: confidence, question },
      })
    } catch (error) {
      if (session.signal.aborted || error instanceof AgentRunSupersededError) throw error
      // no decision is never a guess: Guard reads a missing confidence as the lowest one
      const code = failureCodeOf(error) ?? 'INTERNAL_ERROR'
      this.deps.logger.warn(
        { orgId: session.orgId, runId: session.runId, seq, code },
        'agent run decision failed',
      )
      await this.deps.recorder.record(this.run(session), seq, {
        type: 'decision',
        name: `Is "${tool.label}" the right action?`,
        status: 'failed',
        output: { ...base, kind: 'decision', callId: call.id, question },
        errorCode: code,
        startedAt,
        finishedAt: this.now(),
      })
    }
  }

  // ---- Guard --------------------------------------------------------------------------------

  /** `guard.check` for one call: nothing runs before it. The result is the `guard` step. */
  async check(
    session: RunSession,
    state: RunState,
    call: CallState,
    tool: ResolvedTool,
  ): Promise<void> {
    const seq = state.nextSeq
    const startedAt = this.now()
    const decision = call.decision
    const reasoning =
      decision?.output?.kind === 'decision' && decision.output.reasoning !== undefined
        ? [{ text: decision.output.reasoning, confidence: decision.confidence ?? 0 }]
        : []
    const passages = state.retrieval?.passages ?? []
    const result = await this.deps.guard.check(
      { orgId: session.orgId, requestId: session.runId },
      {
        agent: { id: session.agent.id, version: session.version ?? 0 },
        guard: session.definition.guard,
        doubleCheckModelKey: session.definition.model.doubleCheckModelKey,
        action: {
          name: tool.toolName,
          input: call.arguments,
          permission: tool.permission,
          title: tool.label,
        },
        confidence: decision?.confidence ?? null,
        teamIds: session.guardTeamIds,
        runId: session.runId,
        seq,
        reasoning,
        sources: passages.map((passage) => ({
          title: passage.title,
          documentId: passage.documentId,
          ref: passage.page === null ? null : `p. ${passage.page}`,
        })),
        onBehalfOfUserId: session.starterId,
        modelContext: session.modelContext(seq),
        signal: session.signal,
      },
    )
    await this.deps.recorder.record(this.run(session), seq, {
      type: 'guard',
      name: `Guard: ${tool.label}`,
      status: result.outcome === 'blocked' ? 'blocked' : 'succeeded',
      input: { ...base, kind: 'guard', callId: call.id, action: tool.toolName },
      output: { ...base, kind: 'guard', callId: call.id, action: tool.toolName, result },
      confidence: result.confidence,
      guardBand: result.outcome,
      approvalId: result.approvalId,
      errorCode: result.reasonCode,
      startedAt,
      finishedAt: this.now(),
    })
    await this.publish(session, {
      type: 'data-guard',
      data: { seq, action: tool.toolName, result },
    })
  }

  // ---- Running a call -----------------------------------------------------------------------

  /** Runs the call that Guard allowed, or a person approved, and stores what came back. */
  async execute(
    session: RunSession,
    state: RunState,
    call: CallState,
    tool: ResolvedTool,
  ): Promise<void> {
    const seq = state.nextSeq
    const startedAt = this.now()
    const args = argumentsOf(call)
    const outcome = await Promise.race([
      this.deps.tools.execute(session.tools, tool, args),
      whenAborted(session.signal),
    ])
    const { content } = outcome
    const output: AgentRunStepData = {
      ...base,
      kind: 'tool',
      callId: call.id,
      result: content,
      isError: !outcome.ok,
    }
    await this.deps.recorder.record(
      this.run(session),
      seq,
      {
        type: 'tool',
        name: tool.label,
        status: outcome.ok ? 'succeeded' : 'failed',
        input: { ...base, kind: 'tool', callId: call.id, toolId: tool.toolId, arguments: args },
        output,
        errorCode: outcome.ok ? null : outcome.code,
        startedAt,
        finishedAt: this.now(),
      },
      async (tx) => {
        // a call that changes something outside SurefyOS is audited; reads are not
        if (tool.permission === 'read_only') return
        await this.deps.audit.record(
          tx,
          { orgId: session.orgId, userId: session.starterId, via: 'system' },
          {
            action: AGENT_RUN_AUDIT_ACTIONS.AGENT_RUN_ACTION_EXECUTED,
            target: { type: 'agent_run', id: session.runId },
            actor: { type: 'agent', refId: session.agent.id },
            outcome: outcome.ok ? 'success' : 'failed',
            metadata: { labels: { tool: tool.toolName, permission: tool.permission } },
          },
        )
      },
    )
    await this.publish(session, {
      type: 'tool-output-available',
      toolCallId: call.id,
      output: content,
    })
  }

  /** A call that is not run: blocked by Guard, rejected by a person, a tool that does not exist, or one too many. */
  async skip(
    session: RunSession,
    state: RunState,
    call: CallState,
    why: 'blocked' | 'rejected' | 'unknown' | 'too_many',
  ): Promise<void> {
    const seq = state.nextSeq
    const startedAt = this.now()
    const text = {
      blocked: BLOCKED_RESULT,
      rejected: REJECTED_RESULT,
      unknown: UNKNOWN_TOOL_RESULT,
      too_many: TOO_MANY_CALLS_RESULT,
    }[why]
    const reasonCode = call.guardResult?.reasonCode ?? null
    const status = SKIP_STATUS[why]
    await this.deps.recorder.record(this.run(session), seq, {
      type: 'tool',
      name: call.name,
      status,
      input: { ...base, kind: 'tool', callId: call.id, arguments: call.arguments },
      output: { ...base, kind: 'tool', callId: call.id, result: text, isError: why !== 'rejected' },
      errorCode: why === 'blocked' ? reasonCode : SKIP_ERROR[why],
      startedAt,
      finishedAt: this.now(),
    })
    await this.publish(session, {
      type: 'tool-output-available',
      toolCallId: call.id,
      output: text,
    })
  }

  // ---- Approvals ----------------------------------------------------------------------------

  /**
   * Writes the waiting `approval` step of every call that needs a person and, in the same
   * transaction, pauses the run: no worker, connection or timer is held while people decide. When
   * every approval was decided meanwhile there is nothing to wait for and the run goes on.
   */
  async requestApprovals(
    session: RunSession,
    state: RunState,
    calls: readonly { call: CallState; tool: ResolvedTool | undefined }[],
  ): Promise<{ paused: boolean }> {
    const startedAt = this.now()
    const run = this.run(session)
    const written: { seq: number; approvalId: string; title: string }[] = []
    const paused = await this.deps.db.tenant(session.orgId, async (tx) => {
      let seq = state.nextSeq
      for (const { call, tool } of calls) {
        const approvalId = call.approvalId
        if (approvalId === null) continue
        const title = tool?.label ?? call.name
        await this.deps.recorder.recordIn(tx, run, seq, {
          type: 'approval',
          name: title,
          status: 'waiting',
          input: { ...base, kind: 'approval', callId: call.id, ruleRef: null },
          approvalId,
          startedAt,
          effects: { neededHuman: true },
        })
        written.push({ seq, approvalId, title })
        seq += 1
      }
      return this.pauseIn(
        tx,
        session,
        written.map((entry) => entry.approvalId),
      )
    })
    await this.announce(session, written, paused)
    return { paused }
  }

  /** Approval steps exist and none is decided: the run waits again (a duplicate or a stale job). */
  async pause(session: RunSession, approvalIds: readonly string[]): Promise<{ paused: boolean }> {
    const paused = await this.deps.db.tenant(session.orgId, (tx) =>
      this.pauseIn(tx, session, approvalIds),
    )
    if (paused)
      await this.publish(session, {
        type: 'data-run',
        data: { runId: session.runId, status: 'waiting_approval', errorCode: null },
      })
    return { paused }
  }

  private async pauseIn(
    tx: Parameters<Parameters<Database['tenant']>[1]>[0],
    session: RunSession,
    approvalIds: readonly string[],
  ): Promise<boolean> {
    const resolutions = await this.deps.approvals.resolutionsOf(tx, session.orgId, approvalIds)
    const pending = approvalIds.some(
      (id) => (resolutions.get(id)?.outcome ?? 'pending') === 'pending',
    )
    if (!pending) return false
    const marked = await this.deps.repository.markWaiting(tx, session.orgId, session.runId)
    if (!marked) throw new AgentRunSupersededError()
    return true
  }

  private async announce(
    session: RunSession,
    written: readonly { seq: number; approvalId: string; title: string }[],
    paused: boolean,
  ): Promise<void> {
    for (const entry of written) {
      await this.publish(session, {
        type: 'data-approval-required',
        data: {
          seq: entry.seq,
          approvalId: entry.approvalId,
          title: entry.title,
          assignees: [],
          expiresAt: null,
        },
      })
    }
    if (paused) {
      await this.publish(session, {
        type: 'data-run',
        data: { runId: session.runId, status: 'waiting_approval', errorCode: null },
      })
    }
  }

  /** A decided approval becomes the closing `approval` step of its call. */
  async resolve(
    session: RunSession,
    state: RunState,
    call: CallState,
    tool: ResolvedTool | undefined,
  ): Promise<void> {
    const approvalId = call.approvalId
    if (approvalId === null) return
    const resolution = await this.deps.db.tenant(session.orgId, async (tx) =>
      (await this.deps.approvals.resolutionsOf(tx, session.orgId, [approvalId])).get(approvalId),
    )
    if (resolution === undefined || resolution.outcome === 'pending') return
    const runs = ['approved', 'approved_with_edits', 'timed_out_continued'].includes(
      resolution.outcome,
    )
    const changed =
      resolution.outcome !== 'approved' && resolution.outcome !== 'timed_out_continued'
    const at = resolution.decidedAt ?? this.now()
    await this.deps.recorder.record(this.run(session), state.nextSeq, {
      type: 'approval',
      name: tool?.label ?? call.name,
      status: runs ? 'succeeded' : 'skipped',
      output: {
        ...base,
        kind: 'approval',
        callId: call.id,
        ruleRef: resolution.ruleRef,
        outcome: resolution.outcome,
        ...(resolution.editedInput === null ? {} : { editedInput: { ...resolution.editedInput } }),
      },
      approvalId,
      startedAt: at,
      finishedAt: at,
      effects: { humanCorrected: changed },
    })
  }
}
