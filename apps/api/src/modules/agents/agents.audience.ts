// SPDX-License-Identifier: AGPL-3.0-only
import { UnprocessableError } from '@/core/errors/index.js'
import { AGENT_AUDIT_ACTIONS, ERROR_CODES } from '@surefy/contracts'
import type {
  AgentAccessDto,
  AgentAccessEntryInput,
  ReplaceAgentAccessInput,
} from '@surefy/contracts'

import { viewerOf } from './agents.access.js'
import {
  AgentEditForbiddenError,
  AgentModelNotAllowedForAudienceError,
  AgentNotEditableError,
  AgentNotFoundError,
} from './agents.errors.js'

import type { AgentPresenter } from './agents.presenter.js'
import type { AgentReadiness } from './agents.readiness.js'
import type { AgentAccessRow, AgentRow, AgentsRepository } from './agents.repository.js'
import type { AgentsContext, AgentsOrganizations, AgentsTeams } from './agents.types.js'
import type { Database, DbExecutor } from '@/core/database/index.js'
import type { AuditRecorder } from '@/modules/audit/index.js'

export interface AgentAudienceDeps {
  db: Database
  repository: AgentsRepository
  presenter: AgentPresenter
  readiness: AgentReadiness
  teams: AgentsTeams
  organizations: AgentsOrganizations
  audit: AuditRecorder
}

function keyOf(entry: AgentAccessEntryInput): string {
  if (entry.subjectType === 'organization') return 'organization'
  return entry.subjectType === 'team' ? `team:${entry.teamId}` : `user:${entry.userId}`
}

/** The stored rows as the entries a request would send. */
export function entriesOf(rows: readonly AgentAccessRow[]): AgentAccessEntryInput[] {
  return rows.flatMap((row): AgentAccessEntryInput[] => {
    if (row.subjectType === 'organization') return [{ subjectType: 'organization', level: 'use' }]
    if (row.subjectType === 'team' && row.teamId !== null) {
      return [{ subjectType: 'team', teamId: row.teamId, level: row.level }]
    }
    if (row.subjectType === 'user' && row.userId !== null) {
      return [{ subjectType: 'user', userId: row.userId, level: row.level }]
    }
    return []
  })
}

/**
 * "Who can use it" (agents-and-runs.md §3): the audience is live metadata, not versioned, so a
 * roll back never changes it. Every write bumps the organization's access version, because
 * effective access lists the agents a person can use.
 */
export class AgentAudience {
  constructor(private readonly deps: AgentAudienceDeps) {}

  async get(ctx: AgentsContext, agentId: string): Promise<AgentAccessDto> {
    return this.deps.db.tenant(ctx.orgId, async (tx) => {
      const found = await this.deps.repository.findVisible(tx, ctx.orgId, agentId, viewerOf(ctx))
      if (found === undefined) throw new AgentNotFoundError()
      return this.deps.presenter.audience(
        tx,
        ctx.orgId,
        await this.deps.repository.listAccess(tx, ctx.orgId, agentId),
      )
    })
  }

  /** Replaces the whole audience. Teams and people added must be allowed the agent's model. */
  async replace(
    ctx: AgentsContext,
    agentId: string,
    input: ReplaceAgentAccessInput,
  ): Promise<AgentAccessDto> {
    return this.deps.db.tenant(ctx.orgId, async (tx) => {
      const found = await this.deps.repository.lockVisible(tx, ctx.orgId, agentId, viewerOf(ctx))
      if (found === undefined) throw new AgentNotFoundError()
      if (!found.canEdit) throw new AgentEditForbiddenError()
      if (found.agent.status === 'archived') throw new AgentNotEditableError()
      await this.apply(tx, ctx, found.agent, input.entries, { checkModel: true })
      return this.deps.presenter.audience(
        tx,
        ctx.orgId,
        await this.deps.repository.listAccess(tx, ctx.orgId, agentId),
      )
    })
  }

  /**
   * Inside the caller's transaction, with the agent row locked: checks the people, checks the
   * model for the entries added (when asked to), writes the rows, bumps the access version and
   * records the change. Returns whether anything changed.
   */
  async apply(
    tx: DbExecutor,
    ctx: AgentsContext,
    agent: AgentRow,
    entries: readonly AgentAccessEntryInput[],
    options: { checkModel: boolean },
  ): Promise<boolean> {
    await this.assertExist(tx, ctx.orgId, entries)
    const before = entriesOf(await this.deps.repository.listAccess(tx, ctx.orgId, agent.id))
    const known = new Map(before.map((entry) => [keyOf(entry), entry]))
    const added = entries.filter((entry) => !known.has(keyOf(entry)))
    if (options.checkModel && added.length > 0) {
      const failures = await this.deps.readiness.modelFailures(
        tx,
        ctx.orgId,
        agent.draftDefinition,
        added,
      )
      const audienceFailures = failures.filter((failure) => failure.type !== 'model')
      if (audienceFailures.length > 0) {
        throw new AgentModelNotAllowedForAudienceError(audienceFailures)
      }
    }
    const same =
      before.length === entries.length &&
      entries.every((entry) => known.get(keyOf(entry))?.level === entry.level)
    if (same) return false
    await this.deps.repository.replaceAccess(tx, ctx.orgId, agent.id, entries, ctx.userId)
    await this.deps.organizations.bumpAccessVersionInTx(tx, ctx.orgId)
    await this.deps.audit.record(tx, ctx, {
      action: AGENT_AUDIT_ACTIONS.AGENT_ACCESS_CHANGED,
      target: { type: 'agent', id: agent.id },
      metadata: { counts: { before: before.length, after: entries.length, added: added.length } },
    })
    return true
  }

  /** Every team and person named is in this organization. */
  private async assertExist(
    tx: DbExecutor,
    orgId: string,
    entries: readonly AgentAccessEntryInput[],
  ): Promise<void> {
    const teamIds = entries.flatMap((entry) => (entry.subjectType === 'team' ? [entry.teamId] : []))
    const userIds = entries.flatMap((entry) => (entry.subjectType === 'user' ? [entry.userId] : []))
    const [teams, members] = await Promise.all([
      this.deps.teams.findRefsInTx(tx, orgId, teamIds),
      this.deps.repository.activeMemberIds(tx, orgId, userIds),
    ])
    const knownTeams = new Set(teams.map((team) => team.id))
    const missing = [
      ...teamIds.filter((id) => !knownTeams.has(id)).map((id) => ({ field: 'teamId', id })),
      ...userIds.filter((id) => !members.has(id)).map((id) => ({ field: 'userId', id })),
    ]
    if (missing.length > 0) {
      throw new UnprocessableError(
        ERROR_CODES.VALIDATION_FAILED,
        'Some people or teams were not found',
        {
          details: missing.map((item) => ({ ...item })),
        },
      )
    }
  }
}
