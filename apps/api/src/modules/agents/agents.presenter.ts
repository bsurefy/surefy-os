// SPDX-License-Identifier: AGPL-3.0-only
import type {
  AgentAccessDto,
  AgentAttentionReason,
  AgentAudienceSummaryDto,
  AgentDetailDto,
  AgentDraftDto,
  AgentDto,
  AgentTool,
  AgentVersionDto,
  UserRefDto,
} from '@surefy/contracts'

import { canDelete } from './agents.access.js'
import { EMPTY_RUN_SUMMARY } from './agents.types.js'

import type {
  AgentAccessRow,
  AgentListRow,
  AgentRow,
  AgentsRepository,
  AgentVersionRow,
} from './agents.repository.js'
import type {
  AgentApprovals,
  AgentChannels,
  AgentRuns,
  AgentsConnections,
  AgentsContext,
  AgentsModels,
  AgentsTeams,
  AgentsUserRefs,
} from './agents.types.js'
import type { DbExecutor } from '@/core/database/index.js'

export interface AgentPresenterDeps {
  repository: AgentsRepository
  users: AgentsUserRefs
  teams: AgentsTeams
  models: AgentsModels
  connections: AgentsConnections
  runs: AgentRuns
  approvals: AgentApprovals
  channels: AgentChannels
}

/** Teams named on a card; the rest are counted. */
const AUDIENCE_TEAMS_SHOWN = 3

/** The connection ids an enabled tool of a definition uses. */
export function connectionIdsOf(tools: readonly AgentTool[] | null): string[] {
  const ids = new Set<string>()
  for (const tool of tools ?? []) {
    if (!tool.enabled) continue
    if ('connectionId' in tool && tool.connectionId !== null) ids.add(tool.connectionId)
  }
  return [...ids]
}

/** Turns agent rows into the DTOs of the list, the editor and the version list. */
export class AgentPresenter {
  constructor(private readonly deps: AgentPresenterDeps) {}

  /** Cards for a page of rows, loading everything they show in one round per source. */
  async cards(
    tx: DbExecutor,
    ctx: AgentsContext,
    rows: readonly AgentListRow[],
  ): Promise<AgentDto[]> {
    if (rows.length === 0) return []
    const { orgId } = ctx
    const agentIds = rows.map((row) => row.agent.id)
    const owners = await this.deps.users.findUserRefs(
      rows.flatMap((row) => (row.agent.ownerUserId === null ? [] : [row.agent.ownerUserId])),
    )
    const modelKeys = [...new Set(rows.map((row) => row.liveModelKey ?? modelKeyOf(row.agent)))]
    const [models, unavailable, audiences, runs, waiting, connections] = await Promise.all([
      this.deps.models.refs(tx, orgId, modelKeys),
      this.deps.models.unavailable(tx, orgId, modelKeys),
      this.audiences(tx, orgId, agentIds),
      this.deps.runs.summaries(tx, orgId, agentIds),
      this.deps.approvals.waitingCounts(tx, orgId, agentIds),
      this.deps.connections.statuses(
        tx,
        orgId,
        rows.flatMap((row) => connectionIdsOf(row.liveTools)),
      ),
    ])
    return rows.map((row) => {
      const { agent } = row
      const summary = runs.get(agent.id) ?? EMPTY_RUN_SUMMARY
      const attention: AgentAttentionReason[] = []
      if (row.liveVersion !== null && agent.status !== 'archived') {
        const failed = connectionIdsOf(row.liveTools).some(
          (id) => connections.get(id)?.status !== 'active',
        )
        if (failed) attention.push('connection_failed')
        if (row.liveModelKey !== null && unavailable.has(row.liveModelKey)) {
          attention.push('model_not_allowed')
        }
        if (summary.recentRunsFailed) attention.push('recent_runs_failed')
      }
      return {
        id: agent.id,
        name: agent.name,
        description: agent.description,
        status: agent.status,
        owner: agent.ownerUserId === null ? null : (owners.get(agent.ownerUserId) ?? null),
        model: models.get(row.liveModelKey ?? modelKeyOf(agent)) ?? null,
        liveVersion: row.liveVersion,
        hasUnpublishedChanges: agent.hasUnpublishedChanges,
        templateKey: agent.templateKey,
        sharedWith: audiences.get(agent.id) ?? EMPTY_AUDIENCE,
        lastRun:
          summary.lastRun === null
            ? null
            : { status: summary.lastRun.status, at: summary.lastRun.at.toISOString() },
        runsThisWeek: summary.runsThisWeek,
        approvalsWaiting: waiting.get(agent.id) ?? 0,
        trust: summary.trust,
        needsAttention: attention,
        canEdit: row.canEdit,
        canDelete: canDelete(ctx, agent.ownerUserId),
        pausedAt: agent.pausedAt?.toISOString() ?? null,
        archivedAt: agent.archivedAt?.toISOString() ?? null,
        createdAt: agent.createdAt.toISOString(),
        updatedAt: agent.updatedAt.toISOString(),
      }
    })
  }

  /** The editor's header and tabs: the card, the draft and the channels. */
  async detail(tx: DbExecutor, ctx: AgentsContext, row: AgentListRow): Promise<AgentDetailDto> {
    const [card] = await this.cards(tx, ctx, [row])
    if (card === undefined) throw new Error('card missing')
    const channels = await this.deps.channels.list(tx, ctx.orgId, [row.agent.id])
    return {
      ...card,
      draft: await this.draft(row.agent),
      channels: [...(channels.get(row.agent.id) ?? [])],
    }
  }

  async draft(agent: AgentRow): Promise<AgentDraftDto> {
    const users =
      agent.draftUpdatedByUserId === null
        ? new Map<string, UserRefDto>()
        : await this.deps.users.findUserRefs([agent.draftUpdatedByUserId])
    return {
      definition: agent.draftDefinition,
      revision: agent.draftRevision,
      updatedAt: agent.draftUpdatedAt.toISOString(),
      updatedBy:
        agent.draftUpdatedByUserId === null
          ? null
          : (users.get(agent.draftUpdatedByUserId) ?? null),
    }
  }

  /** Versions with their publishers; `liveVersionId` marks the live one. */
  async versions(
    rows: readonly AgentVersionRow[],
    liveVersionId: string | null,
  ): Promise<AgentVersionDto[]> {
    const users = await this.deps.users.findUserRefs(
      rows.flatMap((row) => (row.publishedByUserId === null ? [] : [row.publishedByUserId])),
    )
    return rows.map((row) => ({
      id: row.id,
      version: row.version,
      notes: row.notes,
      publishedBy:
        row.publishedByUserId === null ? null : (users.get(row.publishedByUserId) ?? null),
      publishedAt: row.publishedAt.toISOString(),
      isLive: row.id === liveVersionId,
    }))
  }

  /** The audience rows with the names of their teams and people. */
  async audience(
    tx: DbExecutor,
    orgId: string,
    rows: readonly AgentAccessRow[],
  ): Promise<AgentAccessDto> {
    const teams = await this.deps.teams.findRefsInTx(
      tx,
      orgId,
      rows.flatMap((row) => (row.teamId === null ? [] : [row.teamId])),
    )
    const teamsById = new Map(teams.map((team) => [team.id, team]))
    const users = await this.deps.users.findUserRefs(
      rows.flatMap((row) => (row.userId === null ? [] : [row.userId])),
    )
    return {
      entries: rows.map((row) => ({
        id: row.id,
        subjectType: row.subjectType,
        team: row.teamId === null ? null : (teamsById.get(row.teamId) ?? null),
        user: row.userId === null ? null : (users.get(row.userId) ?? null),
        level: row.level,
        createdAt: row.createdAt.toISOString(),
      })),
    }
  }

  /** "Shared with" per agent: everyone, or a few teams and the count of the rest. */
  async audiences(
    tx: DbExecutor,
    orgId: string,
    agentIds: readonly string[],
  ): Promise<ReadonlyMap<string, AgentAudienceSummaryDto>> {
    const rows = await this.deps.repository.accessOfAgents(tx, orgId, agentIds)
    const teamIds = [...new Set(rows.flatMap((row) => (row.teamId === null ? [] : [row.teamId])))]
    const teams = await this.deps.teams.findRefsInTx(tx, orgId, teamIds)
    const teamsById = new Map(teams.map((team) => [team.id, team]))
    const summaries = new Map<string, AgentAudienceSummaryDto>()
    for (const agentId of agentIds) {
      const own = rows.filter((row) => row.agentId === agentId)
      const teamRows = own.filter((row) => row.subjectType === 'team')
      summaries.set(agentId, {
        everyone: own.some((row) => row.subjectType === 'organization'),
        teams: teamRows.slice(0, AUDIENCE_TEAMS_SHOWN).flatMap((row) => {
          const team = row.teamId === null ? undefined : teamsById.get(row.teamId)
          return team === undefined ? [] : [team]
        }),
        teamCount: teamRows.length,
        userCount: own.filter((row) => row.subjectType === 'user').length,
      })
    }
    return summaries
  }
}

const EMPTY_AUDIENCE: AgentAudienceSummaryDto = {
  everyone: false,
  teams: [],
  teamCount: 0,
  userCount: 0,
}

/** The model of the draft: what an agent without a live version shows. */
const modelKeyOf = (agent: AgentRow): string => agent.draftDefinition.model.modelKey
