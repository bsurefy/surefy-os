// SPDX-License-Identifier: AGPL-3.0-only
import { AGENT_RUN_AUDIT_ACTIONS, AGENT_RUN_ANONYMOUS_TRIGGERS } from '@surefy/contracts'
import type { AgentRunInput, RetryAgentRunInput } from '@surefy/contracts'

import {
  AgentRunAgentNotEditableError,
  AgentRunAgentNotFoundError,
  AgentRunAgentNotPublishedError,
  AgentRunAgentPausedError,
  AgentRunInvalidInputError,
  AgentRunLimitReachedError,
  AgentRunNotFoundError,
  AgentRunNotRetryableError,
} from './agentRuns.errors.js'
import { rowOf } from './agentRuns.recorder.js'
import { inputOf } from './agentRuns.state.js'

import type { RunLifecycle } from './agentRuns.lifecycle.js'
import type { AgentRunsRepository } from './agentRuns.repository.js'
import type {
  AgentRunsAgents,
  AgentRunsContext,
  AgentRunsDispatcher,
  AgentRunsPeople,
  RunnableAgent,
  RunPerson,
  RunRow,
  StartRunInput,
  StepRow,
} from './agentRuns.types.js'
import type { Database, DbExecutor } from '@/core/database/index.js'
import type { AuditRecorder } from '@/modules/audit/index.js'

export interface AgentRunsServiceDeps {
  db: Database
  repository: AgentRunsRepository
  agents: AgentRunsAgents
  people: AgentRunsPeople
  dispatcher: AgentRunsDispatcher
  lifecycle: RunLifecycle
  audit: AuditRecorder
  now?: () => Date
}

const FINISHED = ['failed', 'timed_out', 'canceled'] as const

const startOfMonth = (now: Date): Date =>
  new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))

/**
 * Starting, canceling and retrying runs (backend/agent-runs.md, §3, §7). A run is only a row and
 * its first step here: the worker executes it. Starters (Chat, the editor's Test tab, the API
 * channel, the widget, Slack and WhatsApp) all call `start`.
 */
export class AgentRunsService {
  private readonly now: () => Date

  constructor(private readonly deps: AgentRunsServiceDeps) {
    this.now = deps.now ?? (() => new Date())
  }

  /** Queues a run of the agent and returns it; the executor starts after the commit. */
  async start(ctx: AgentRunsContext, input: StartRunInput): Promise<RunRow> {
    const starter = await this.starterOf(ctx)
    const run = await this.deps.db.tenant(ctx.orgId, (tx) => this.startIn(tx, ctx, input, starter))
    await this.dispatch(run)
    return run
  }

  /**
   * Ends an open run (T2: "Steps already done aren't undone"). One conditional update; a run that
   * already ended is returned unchanged. The executor notices through its heartbeat or at the next
   * step it persists, so at most the step in flight completes.
   */
  async cancel(ctx: AgentRunsContext, runId: string): Promise<RunRow> {
    const run = await this.deps.db.tenant(ctx.orgId, (tx) => this.steerable(tx, ctx, runId))
    const ended = await this.deps.lifecycle.end({
      orgId: ctx.orgId,
      runId: run.id,
      from: ['queued', 'running', 'waiting_approval'],
      status: 'canceled',
      actor: ctx,
    })
    if (ended !== undefined) return ended
    return this.deps.db.tenant(ctx.orgId, async (tx) => {
      const current = await this.deps.repository.findRun(tx, ctx.orgId, runId)
      if (current === undefined) throw new AgentRunNotFoundError()
      return current
    })
  }

  /**
   * A new run with the same input; a finished run is never reopened. `fromFailedStep` (test runs
   * only) reuses the steps before the failed tool call, so the builder does not wait for them.
   */
  async retry(ctx: AgentRunsContext, runId: string, request: RetryAgentRunInput): Promise<RunRow> {
    const starter = await this.starterOf(ctx)
    const run = await this.deps.db.tenant(ctx.orgId, async (tx) => {
      const original = await this.steerable(tx, ctx, runId)
      if (
        !(FINISHED as readonly string[]).includes(original.status) &&
        !(original.isTest && original.status === 'succeeded')
      ) {
        throw new AgentRunNotRetryableError(
          original.status === 'succeeded' ? 'succeeded' : 'active',
        )
      }
      if (request.fromFailedStep && !original.isTest)
        throw new AgentRunNotRetryableError('not_a_test')
      const steps = await this.deps.repository.listSteps(tx, ctx.orgId, original)
      const earlier = inputOf(steps)
      if (earlier === undefined) throw new AgentRunNotRetryableError('expired')
      const failed = [...steps]
        .reverse()
        .find((step) => step.type === 'tool' && step.status === 'failed')
      if (request.fromFailedStep && failed === undefined) {
        throw new AgentRunNotRetryableError('no_failed_step')
      }
      const reuse =
        request.fromFailedStep && failed !== undefined
          ? steps.filter((step) => step.seq > 1 && step.seq < failed.seq)
          : []
      const started = await this.startIn(
        tx,
        ctx,
        {
          agentId: original.agentId,
          trigger: original.trigger,
          input: {
            messages: earlier.messages,
            externalRef: earlier.externalRef,
            ...(earlier.metadata === undefined ? {} : { metadata: earlier.metadata }),
          },
          channelId: original.channelId,
          chatId: original.chatId,
          retryOf: { runId: original.id, seq: failed?.seq ?? null },
          reuse,
        },
        starter,
      )
      await this.deps.audit.record(tx, ctx, {
        action: AGENT_RUN_AUDIT_ACTIONS.AGENT_RUN_RETRIED,
        target: { type: 'agent_run', id: started.id },
        metadata: { refs: { originalRunId: original.id } },
      })
      return started
    })
    await this.dispatch(run)
    return run
  }

  // ---- Private ------------------------------------------------------------------------------

  /**
   * The run if the caller may steer it: an API key its own runs; a person the runs they started
   * and the runs of agents they can edit. Anyone else gets the same 404 as for a missing run.
   */
  private async steerable(tx: DbExecutor, ctx: AgentRunsContext, runId: string): Promise<RunRow> {
    const run = await this.deps.repository.findRun(tx, ctx.orgId, runId)
    if (run === undefined) throw new AgentRunNotFoundError()
    if (ctx.apiKey !== undefined) {
      if (run.apiKeyId !== ctx.apiKey.id) throw new AgentRunNotFoundError()
      return run
    }
    const agent = await this.deps.agents.findUsable(tx, ctx, run.agentId)
    const own = ctx.userId !== null && run.startedByUserId === ctx.userId
    if (agent === undefined || !(agent.canEdit || own)) throw new AgentRunNotFoundError()
    return run
  }

  /** Enqueues the executor; the job id makes a second enqueue for the same run a no-op. */
  private dispatch(run: RunRow): Promise<void> {
    return this.deps.dispatcher.execute(run.organizationId, run.id, `agent-run-${run.id}`)
  }

  /** The starter's access, read before the transaction opens (the access module opens its own). */
  private starterOf(ctx: AgentRunsContext): Promise<RunPerson | null> {
    return ctx.userId === null
      ? Promise.resolve(null)
      : this.deps.people.forMember(ctx.orgId, ctx.userId)
  }

  private async startIn(
    tx: DbExecutor,
    ctx: AgentRunsContext,
    input: StartRunInput,
    starter: RunPerson | null,
  ): Promise<RunRow> {
    const { orgId } = ctx
    if (input.input.messages.length === 0) throw new AgentRunInvalidInputError('messages')
    const isTest = input.trigger === 'test'
    const anonymous = (AGENT_RUN_ANONYMOUS_TRIGGERS as readonly string[]).includes(input.trigger)
    const agent = await this.agentFor(tx, ctx, input.agentId, { isTest, anonymous })
    this.assertStartable(agent, isTest)
    await this.assertRoomForAnother(tx, ctx)

    let versionId: string | null = null
    if (!isTest) {
      if (agent.liveVersionId === null) throw new AgentRunAgentNotPublishedError()
      const version = await this.deps.agents.findVersion(tx, orgId, agent.id, agent.liveVersionId)
      if (version === undefined) throw new AgentRunAgentNotPublishedError()
      versionId = version.id
    }

    const run = await this.deps.repository.insertRun(tx, {
      organizationId: orgId,
      agentId: agent.id,
      agentVersionId: versionId,
      trigger: input.trigger,
      isTest,
      status: 'queued',
      startedByUserId: anonymous ? null : ctx.userId,
      teamId: anonymous ? null : (starter?.primaryTeamId ?? null),
      apiKeyId: ctx.apiKey?.id ?? null,
      channelId: input.channelId ?? null,
      chatId: input.chatId ?? null,
    })

    const runInput: AgentRunInput = {
      messages: [...input.input.messages],
      channelId: input.channelId ?? null,
      externalRef: input.input.externalRef ?? null,
      ...(input.input.metadata === undefined ? {} : { metadata: input.input.metadata }),
      definitionSnapshot: isTest ? agent.draftDefinition : null,
      retryOf: input.retryOf ?? null,
    }
    const startedAt = this.now()
    await this.writeFirstStep(tx, run, runInput, startedAt)
    if (input.reuse !== undefined) await this.copySteps(tx, run, input.reuse, startedAt)

    if (!isTest && anonymous) {
      await this.deps.audit.record(tx, ctx, {
        action: AGENT_RUN_AUDIT_ACTIONS.AGENT_RUN_STARTED,
        target: { type: 'agent_run', id: run.id },
        actor: { type: 'agent', refId: agent.id },
        metadata: { labels: { trigger: input.trigger } },
      })
    }
    return run
  }

  /**
   * The agent a run starts for. A channel answers for the organization (who may use the agent is
   * the channel's rule, checked by its adapter); a test runs the draft, which only people who can
   * edit the agent see.
   */
  private async agentFor(
    tx: DbExecutor,
    ctx: AgentRunsContext,
    agentId: string,
    kind: { isTest: boolean; anonymous: boolean },
  ): Promise<RunnableAgent> {
    const agent = kind.anonymous
      ? await this.deps.agents.findById(tx, ctx.orgId, agentId)
      : await this.deps.agents.findUsable(tx, ctx, agentId)
    if (agent?.deletedAt !== null) throw new AgentRunAgentNotFoundError()
    if (kind.isTest && !agent.canEdit) throw new AgentRunAgentNotFoundError()
    return agent
  }

  private assertStartable(agent: RunnableAgent, isTest: boolean): void {
    if (agent.status === 'archived') {
      throw isTest ? new AgentRunAgentNotEditableError() : new AgentRunAgentPausedError()
    }
    if (agent.status === 'paused') throw new AgentRunAgentPausedError()
  }

  /** The plan or license allows `maxRunsPerMonth` runs a month; tests count. */
  private async assertRoomForAnother(tx: DbExecutor, ctx: AgentRunsContext): Promise<void> {
    const max = ctx.access.limits.maxRunsPerMonth
    if (max === null) return
    await this.deps.repository.lockStarts(tx, ctx.orgId)
    const used = await this.deps.repository.countSince(tx, ctx.orgId, startOfMonth(this.now()))
    if (used < max) return
    const source = ctx.access.reasons.find(
      (reason) => reason.key === 'limit:maxRunsPerMonth',
    )?.source
    throw new AgentRunLimitReachedError({
      limit: 'maxRunsPerMonth',
      max,
      used,
      source: source ?? 'plan',
    })
  }

  /** Step 1 carries the run's input: the executor never reads the chat or the channel again. */
  private async writeFirstStep(
    tx: DbExecutor,
    run: RunRow,
    input: AgentRunInput,
    at: Date,
  ): Promise<void> {
    const written = await this.deps.repository.appendStep(
      tx,
      run.organizationId,
      run.id,
      rowOf(
        {
          type: 'model',
          name: 'Run input',
          status: 'skipped',
          input: { version: 1, truncated: false, kind: 'model', run: input },
          startedAt: at,
          finishedAt: at,
          capped: false,
        },
        1,
      ),
      {},
      { requireRunning: false },
    )
    if (written === undefined) throw new Error('first step of a new run was not written')
  }

  /** The earlier steps of a "Retry step" run, as skipped steps without usage, after the input step. */
  private async copySteps(
    tx: DbExecutor,
    run: RunRow,
    steps: readonly StepRow[],
    at: Date,
  ): Promise<void> {
    let seq = 2
    for (const step of steps) {
      const written = await this.deps.repository.appendStep(
        tx,
        run.organizationId,
        run.id,
        {
          ...rowOf(
            {
              type: step.type,
              name: step.name,
              status: 'skipped',
              input: step.input,
              output: step.output,
              modelKey: step.modelKey,
              confidence: step.confidence,
              guardBand: step.guardBand,
              approvalId: step.approvalId,
              dataLocation: step.dataLocation,
              errorCode: step.errorCode,
              startedAt: at,
              finishedAt: at,
              capped: false,
            },
            seq,
          ),
        },
        {},
        { requireRunning: false },
      )
      if (written === undefined) throw new Error('reused step was not written')
      seq += 1
    }
  }
}
