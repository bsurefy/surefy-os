// SPDX-License-Identifier: AGPL-3.0-only
import { CallMoves } from './agentRuns.calls.js'
import { AgentRunsController } from './agentRuns.controller.js'
import { RedisRunEvents } from './agentRuns.events.js'
import { RunEventStream } from './agentRuns.eventStream.js'
import { AgentRunExecutor } from './agentRuns.executor.js'
import { createExecuteJob, createSweepJob } from './agentRuns.jobs.js'
import { RunLifecycle } from './agentRuns.lifecycle.js'
import { createAgentRunHandlers } from './agentRuns.outbox.js'
import { AgentRunsQueries } from './agentRuns.queries.js'
import { AgentRunsReads } from './agentRuns.reads.js'
import { StepRecorder } from './agentRuns.recorder.js'
import { AgentRunsRepository } from './agentRuns.repository.js'
import { RunResumer } from './agentRuns.resume.js'
import { agentRunsRoutes } from './agentRuns.routes.js'
import { AgentRunsService } from './agentRuns.service.js'
import { RunStreamer } from './agentRuns.streamer.js'
import { AgentRunSweeper } from './agentRuns.sweeper.js'
import { ModelTurns } from './agentRuns.turns.js'
import { NO_CHAT_ANSWERS } from './agentRuns.types.js'

import type { ExecuteAgentRunPayload } from './agentRuns.jobs.js'
import type {
  AgentRunsAgents,
  AgentRunsApprovals,
  AgentRunsChatAnswers,
  AgentRunsDispatcher,
  AgentRunsEvents,
  AgentRunsGateway,
  AgentRunsGuard,
  AgentRunsKnowledge,
  AgentRunsModels,
  AgentRunsOutbox,
  AgentRunsPeople,
  AgentRunsPii,
  AgentRunsTools,
  AgentRunsUsers,
} from './agentRuns.types.js'
import type { Cache } from '@/core/cache/index.js'
import type { Database } from '@/core/database/index.js'
import type { Logger } from '@/core/logger/index.js'
import type { JobDefinition, Queues } from '@/core/queue/index.js'
import type { AuditRecorder } from '@/modules/audit/index.js'

export interface AgentRunsModuleDeps {
  db: Database
  cache: Pick<Cache, 'client'>
  queues: Queues
  logger: Logger
  /** The agents module's rows, and the access module's view of a member. */
  agents: AgentRunsAgents
  people: AgentRunsPeople
  /** Display data for the run list: people and models. */
  users: AgentRunsUsers
  models: AgentRunsModels
  guard: AgentRunsGuard
  /** The personal-data filter of model calls; `guard.piiFilter`. */
  pii: AgentRunsPii
  gateway: AgentRunsGateway
  tools: AgentRunsTools
  knowledge: AgentRunsKnowledge
  approvals: AgentRunsApprovals
  audit: AuditRecorder
  /** The outbox service; read when an event is written, because the outbox is built after this. */
  outbox: () => AgentRunsOutbox
  /** The chats module's answers of chat runs; read when a run pauses or ends (built after this). */
  chatAnswers?: () => AgentRunsChatAnswers
  /** The live view of runs; a Redis stream unless a test replaces it. */
  events?: AgentRunsEvents
  /** The heartbeat interval; tests shorten it. */
  heartbeatMs?: number
  /** The event stream's timings; tests shorten them. */
  stream?: { keepAliveMs?: number; waitingMs?: number }
}

/**
 * Agent runs: starting, canceling and retrying runs, and the executor that runs them in the
 * worker (backend/agent-runs.md). The API server only writes the run row and its first step; the
 * loop never runs in the API process.
 */
export function createAgentRunsModule(deps: AgentRunsModuleDeps) {
  const repository = new AgentRunsRepository()
  const events = deps.events ?? new RedisRunEvents(deps.cache, deps.logger)
  const outbox: AgentRunsOutbox = {
    write: (tx, event) => deps.outbox().write(tx, event),
    kick: () => deps.outbox().kick(),
  }
  const chatAnswers: AgentRunsChatAnswers = {
    waiting: (tx, orgId, runId, approvalIds) =>
      (deps.chatAnswers?.() ?? NO_CHAT_ANSWERS).waiting(tx, orgId, runId, approvalIds),
    finished: (tx, run, steps) =>
      (deps.chatAnswers?.() ?? NO_CHAT_ANSWERS).finished(tx, run, steps),
  }
  const recorder = new StepRecorder({ db: deps.db, repository, events })
  const lifecycle = new RunLifecycle({
    db: deps.db,
    repository,
    approvals: deps.approvals,
    audit: deps.audit,
    outbox,
    events,
    chatAnswers,
  })

  // the executor job is declared after the executor, and the dispatcher that enqueues it before
  const registered: { execute?: JobDefinition<ExecuteAgentRunPayload> } = {}
  const dispatcher: AgentRunsDispatcher = {
    async execute(orgId, runId, jobId, approvalId) {
      if (registered.execute === undefined) throw new Error('the agentRuns job is not registered')
      await deps.queues.enqueue(
        registered.execute,
        { orgId, runId, ...(approvalId === undefined ? {} : { approvalId }) },
        { jobId },
      )
    },
  }

  const executor = new AgentRunExecutor({
    db: deps.db,
    repository,
    lifecycle,
    events,
    agents: deps.agents,
    people: deps.people,
    approvals: deps.approvals,
    turns: new ModelTurns({
      recorder,
      events,
      gateway: deps.gateway,
      pii: deps.pii,
      knowledge: deps.knowledge,
      tools: deps.tools,
      logger: deps.logger,
    }),
    calls: new CallMoves({
      db: deps.db,
      repository,
      recorder,
      events,
      gateway: deps.gateway,
      pii: deps.pii,
      guard: deps.guard,
      tools: deps.tools,
      approvals: deps.approvals,
      audit: deps.audit,
      chatAnswers,
      logger: deps.logger,
    }),
    logger: deps.logger,
    ...(deps.heartbeatMs === undefined ? {} : { heartbeatMs: deps.heartbeatMs }),
  })
  const executeJob = createExecuteJob(executor)
  registered.execute = executeJob

  const resumer = new RunResumer({
    db: deps.db,
    repository,
    approvals: deps.approvals,
    dispatcher,
    logger: deps.logger,
  })
  const sweeper = new AgentRunSweeper({
    db: deps.db,
    repository,
    lifecycle,
    resumer,
    dispatcher,
    logger: deps.logger,
  })
  const service = new AgentRunsService({
    db: deps.db,
    repository,
    agents: deps.agents,
    people: deps.people,
    dispatcher,
    lifecycle,
    audit: deps.audit,
  })

  const reads = new AgentRunsReads()
  const queries = new AgentRunsQueries({
    db: deps.db,
    reads,
    agents: deps.agents,
    users: deps.users,
    models: deps.models,
    approvals: deps.approvals,
  })
  const stream = new RunEventStream({
    cache: deps.cache,
    logger: deps.logger,
    ...(deps.stream ?? {}),
  })
  const streamer = new RunStreamer(stream, queries)
  const controller = new AgentRunsController({ service, queries, streamer })

  return {
    /** Starters (Chat, the Test tab, the API channel, the widget, Slack, WhatsApp) call `service.start`. */
    service,
    queries,
    stream,
    streamer,
    routes: agentRunsRoutes(controller),
    executor,
    resumer,
    sweeper,
    repository,
    events,
    jobs: [executeJob, createSweepJob(sweeper)],
    outboxHandlers: createAgentRunHandlers({ resumer, logger: deps.logger }),
  }
}
export type AgentRunsModule = ReturnType<typeof createAgentRunsModule>
