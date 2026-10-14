// SPDX-License-Identifier: AGPL-3.0-only
import { decodeCursor, parseSort, toPage } from '@/lib/pagination.js'
import { viewerOf } from '@/modules/agents/index.js'
import { AGENT_RUNS_PERMISSIONS } from '@surefy/contracts'
import type {
  AgentRunDetailDto,
  AgentRunDto,
  AgentRunStepDetailDto,
  AgentRunStepsDto,
  ListAgentRunsQuery,
  PublicRunDto,
} from '@surefy/contracts'

import {
  AgentRunAgentNotFoundError,
  AgentRunNotFoundError,
  AgentRunStepNotFoundError,
} from './agentRuns.errors.js'
import {
  factsOf,
  publicRunDto,
  runDetailDto,
  runDto,
  stepDetailDto,
  stepEvent,
} from './agentRuns.present.js'
import { runSort } from './agentRuns.reads.js'

import type { RunFilters, RunListRow, RunScope, AgentRunsReads } from './agentRuns.reads.js'
import type {
  AgentRunsAgents,
  AgentRunsApprovals,
  AgentRunsContext,
  AgentRunsModels,
  AgentRunsUsers,
  RunRow,
  StepRow,
} from './agentRuns.types.js'
import type { Database, DbExecutor } from '@/core/database/index.js'

export interface AgentRunsQueriesDeps {
  db: Database
  reads: AgentRunsReads
  agents: Pick<AgentRunsAgents, 'findUsable'>
  users: AgentRunsUsers
  models: AgentRunsModels
  approvals: Pick<AgentRunsApprovals, 'resolutionsForRun'>
}

type SortField = 'startedAt' | 'durationMs' | 'costMicros'

/** Whose runs the caller reads: an API key its own, a person the runs of the agents they edit and their own. */
export const scopeOf = (ctx: AgentRunsContext): RunScope => {
  if (ctx.apiKey !== undefined) return { kind: 'key', keyId: ctx.apiKey.id }
  if (ctx.channel !== undefined) return { kind: 'channel', channelId: ctx.channel.id }
  return { kind: 'person', viewer: viewerOf(ctx) }
}

const hasPermission = (ctx: AgentRunsContext, key: string): boolean =>
  ctx.access.permissions.some((permission) => permission === key)

const filtersOf = (query: ListAgentRunsQuery, agentId?: string): RunFilters => ({
  ...((agentId ?? query.agentId) === undefined ? {} : { agentId: agentId ?? query.agentId }),
  ...(query.status === undefined ? {} : { statuses: query.status }),
  ...(query.trigger === undefined ? {} : { triggers: query.trigger }),
  ...(query.startedByUserId === undefined ? {} : { startedByUserId: query.startedByUserId }),
  ...(query.teamId === undefined ? {} : { teamId: query.teamId }),
  ...(query.modelKey === undefined ? {} : { modelKey: query.modelKey }),
  ...(query.isTest === undefined ? {} : { isTest: query.isTest }),
  ...(query.neededHuman === true ? { neededHuman: true } : {}),
  ...(query.from === undefined ? {} : { from: new Date(query.from) }),
  ...(query.to === undefined ? {} : { to: new Date(query.to) }),
  ...(query.q === undefined ? {} : { q: query.q }),
})

/** Run history: the list, run detail and the step trace (backend/agent-runs.md, §2, §9). */
export class AgentRunsQueries {
  constructor(private readonly deps: AgentRunsQueriesDeps) {}

  /** Insights › Runs, and an agent's Runs tab when `agentId` is given. */
  async list(
    ctx: AgentRunsContext,
    query: ListAgentRunsQuery,
    agentId?: string,
  ): Promise<{ items: AgentRunDto[]; nextCursor: string | null }> {
    const { field, descending } = parseSort<SortField>(query.sort, '-startedAt')
    return this.deps.db.tenant(ctx.orgId, async (tx) => {
      // an agent the caller cannot see has no Runs tab
      if (
        agentId !== undefined &&
        ctx.apiKey === undefined &&
        (await this.deps.agents.findUsable(tx, ctx, agentId)) === undefined
      ) {
        throw new AgentRunAgentNotFoundError()
      }
      const rows = await this.deps.reads.listPage(tx, ctx.orgId, {
        limit: query.limit,
        sort: runSort(field, descending),
        scope: scopeOf(ctx),
        filters: filtersOf(query, agentId),
        ...(query.cursor === undefined ? {} : { cursor: decodeCursor(query.cursor) }),
      })
      const page = toPage(rows, query.limit, (row) => ({ k: row.sortKey, id: row.run.id }))
      const lookups = await this.lookups(tx, ctx.orgId, page.items)
      return {
        items: page.items.map((view) => runDto(view, lookups)),
        nextCursor: page.nextCursor,
      }
    })
  }

  async get(ctx: AgentRunsContext, runId: string): Promise<AgentRunDetailDto> {
    return this.deps.db.tenant(ctx.orgId, async (tx) => {
      const view = await this.view(tx, ctx, runId)
      const steps = await this.deps.reads.listSteps(tx, ctx.orgId, view.run)
      const lookups = await this.lookups(tx, ctx.orgId, [view])
      const resolutions =
        view.run.status === 'waiting_approval'
          ? await this.deps.approvals.resolutionsForRun(tx, ctx.orgId, view.run.id)
          : []
      return runDetailDto(
        view,
        lookups,
        factsOf(steps, view.run),
        resolutions.filter((resolution) => resolution.outcome === 'pending').map((r) => r.id),
        {
          cancel: hasPermission(ctx, AGENT_RUNS_PERMISSIONS.RUNS_CANCEL.key),
          retry: hasPermission(ctx, AGENT_RUNS_PERMISSIONS.RUNS_RETRY.key),
        },
      )
    })
  }

  /** The run as an API caller sees it: its answer is read from the steps while they are kept. */
  async getPublic(ctx: AgentRunsContext, runId: string): Promise<PublicRunDto> {
    return this.deps.db.tenant(ctx.orgId, async (tx) => {
      const { run } = await this.view(tx, ctx, runId)
      const steps = await this.deps.reads.listSteps(tx, ctx.orgId, run)
      return publicRunDto(run, steps)
    })
  }

  /** The waterfall: every step without its data. */
  async steps(ctx: AgentRunsContext, runId: string): Promise<AgentRunStepsDto> {
    return this.deps.db.tenant(ctx.orgId, async (tx) => {
      const { run } = await this.view(tx, ctx, runId)
      const steps = await this.deps.reads.listSteps(tx, ctx.orgId, run)
      return { items: steps.map(stepEvent), stepsExpired: steps.length === 0 && run.stepCount > 0 }
    })
  }

  async step(ctx: AgentRunsContext, runId: string, seq: number): Promise<AgentRunStepDetailDto> {
    return this.deps.db.tenant(ctx.orgId, async (tx) => {
      const { run } = await this.view(tx, ctx, runId)
      const step = await this.deps.reads.findStep(tx, ctx.orgId, run, seq)
      if (step === undefined) throw new AgentRunStepNotFoundError()
      return stepDetailDto(step)
    })
  }

  /** The run if the caller may read it; the event stream and the steps use the same rule. */
  async access(ctx: AgentRunsContext, runId: string): Promise<RunRow> {
    return this.deps.db.tenant(ctx.orgId, async (tx) => (await this.view(tx, ctx, runId)).run)
  }

  /** The run's current row if the caller may read it (the stream checks it for a final status). */
  async current(ctx: AgentRunsContext, runId: string): Promise<RunRow | undefined> {
    return this.deps.db.tenant(ctx.orgId, async (tx) => {
      const row = await this.deps.reads.findRow(tx, ctx.orgId, runId, scopeOf(ctx))
      return row?.run
    })
  }

  /** The stored steps of a run, for rebuilding events that Redis no longer holds. */
  async stepsOf(ctx: AgentRunsContext, run: RunRow): Promise<StepRow[]> {
    return this.deps.db.tenant(ctx.orgId, (tx) => this.deps.reads.listSteps(tx, ctx.orgId, run))
  }

  private async view(tx: DbExecutor, ctx: AgentRunsContext, runId: string): Promise<RunListRow> {
    const row = await this.deps.reads.findRow(tx, ctx.orgId, runId, scopeOf(ctx))
    if (row === undefined) throw new AgentRunNotFoundError()
    return row
  }

  private async lookups(tx: DbExecutor, orgId: string, views: readonly RunListRow[]) {
    const userIds = new Set<string>()
    const modelKeys = new Set<string>()
    for (const { run } of views) {
      if (run.startedByUserId !== null) userIds.add(run.startedByUserId)
      if (run.modelKey !== null) modelKeys.add(run.modelKey)
    }
    const [users, models] = await Promise.all([
      userIds.size === 0 ? new Map() : this.deps.users.findUserRefs([...userIds]),
      modelKeys.size === 0 ? new Map() : this.deps.models.refs(tx, orgId, [...modelKeys]),
    ])
    return { users, models }
  }
}
