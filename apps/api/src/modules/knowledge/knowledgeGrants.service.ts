// SPDX-License-Identifier: AGPL-3.0-only
import { TeamNotFoundError } from '@/modules/teams/index.js'
import { KNOWLEDGE_AUDIT_ACTIONS } from '@surefy/contracts'
import type {
  KnowledgeAccessDto,
  KnowledgeAccessGrantDto,
  KnowledgeAccessImpactDto,
  SetKnowledgeAccessInput,
} from '@surefy/contracts'

import { KnowledgeGranteeNotFoundError } from './knowledge.errors.js'

import type { KnowledgeRepository } from './knowledge.repository.js'
import type {
  KnowledgeContext,
  KnowledgeMemberships,
  KnowledgeOrganizations,
  KnowledgeTeams,
  KnowledgeUsers,
} from './knowledge.types.js'
import type { KnowledgeAccessService } from './knowledgeAccess.service.js'
import type { Database } from '@/core/database/index.js'
import type { AuditRecorder } from '@/modules/audit/index.js'

export interface KnowledgeGrantsDeps {
  db: Database
  repository: KnowledgeRepository
  access: KnowledgeAccessService
  teams: KnowledgeTeams
  users: KnowledgeUsers
  memberships: KnowledgeMemberships
  organizations: KnowledgeOrganizations
  audit: AuditRecorder
}

const subjectKey = (grant: SetKnowledgeAccessInput['grants'][number]): string =>
  grant.subjectType === 'team' ? `team:${grant.teamId}` : `user:${grant.userId}`

/**
 * The Access tab (database/knowledge.md §2): rows only grant, so "No access" for a team is no row.
 * Every write bumps the organization's access version in its own transaction.
 */
export class KnowledgeGrantsService {
  constructor(private readonly deps: KnowledgeGrantsDeps) {}

  async get(ctx: KnowledgeContext, baseId: string): Promise<KnowledgeAccessDto> {
    const { base, grants } = await this.deps.db.tenant(ctx.orgId, async (tx) => {
      const { base: found } = await this.deps.access.require(tx, ctx, baseId, 'manage')
      return {
        base: found,
        grants: await this.deps.repository.grantsOfBases(tx, ctx.orgId, [baseId]),
      }
    })
    const people = await this.deps.users.findUserRefs(
      grants.flatMap((grant) => (grant.userId === null ? [] : [grant.userId])),
    )
    const dtos = grants.map((grant): KnowledgeAccessGrantDto => ({
      id: grant.id,
      subjectType: grant.subjectType,
      team:
        grant.teamId === null || grant.teamName === null
          ? null
          : { id: grant.teamId, name: grant.teamName },
      user: grant.userId === null ? null : (people.get(grant.userId) ?? null),
      level: grant.level,
      createdAt: grant.createdAt.toISOString(),
    }))
    // agents arrive with V1: none can be blocked by "Local models only" yet
    return { grants: dtos, isLocalOnly: base.isLocalOnly, blockedAgents: [] }
  }

  /** Replaces the grants; an empty list leaves only Admins and Owners. */
  async set(
    ctx: KnowledgeContext,
    baseId: string,
    input: SetKnowledgeAccessInput,
  ): Promise<KnowledgeAccessDto> {
    const unique = [...new Map(input.grants.map((grant) => [subjectKey(grant), grant])).values()]
    await this.deps.db.tenant(ctx.orgId, async (tx) => {
      await this.deps.access.require(tx, ctx, baseId, 'manage')
      const teamIds = unique.flatMap((g) => (g.subjectType === 'team' ? [g.teamId] : []))
      const userIds = unique.flatMap((g) => (g.subjectType === 'user' ? [g.userId] : []))
      if (teamIds.length > 0) {
        const found = await this.deps.teams.findRefsInTx(tx, ctx.orgId, teamIds)
        if (found.length !== teamIds.length) throw new TeamNotFoundError()
      }
      if (userIds.length > 0) {
        const active = await this.deps.memberships.findActiveByUsersInTx(tx, ctx.orgId, userIds)
        if (userIds.some((id) => !active.has(id))) throw new KnowledgeGranteeNotFoundError()
      }
      const before = await this.deps.repository.grantsOfBases(tx, ctx.orgId, [baseId])
      await this.deps.repository.deleteGrants(tx, ctx.orgId, baseId)
      await this.deps.repository.insertGrants(
        tx,
        unique.map((grant) => ({
          organizationId: ctx.orgId,
          knowledgeBaseId: baseId,
          subjectType: grant.subjectType,
          level: grant.level,
          createdByUserId: ctx.userId,
          ...(grant.subjectType === 'team' ? { teamId: grant.teamId } : { userId: grant.userId }),
        })),
      )
      await this.deps.organizations.bumpAccessVersionInTx(tx, ctx.orgId)
      await this.deps.audit.record(tx, ctx, {
        action: KNOWLEDGE_AUDIT_ACTIONS.KNOWLEDGE_BASE_ACCESS_CHANGED,
        target: { type: 'knowledge_base', id: baseId },
        metadata: { counts: { before: before.length, after: unique.length } },
      })
    })
    return this.get(ctx, baseId)
  }

  /** The T2 "Remove access" dialog: the team and the people who lose access through it. */
  async impact(
    ctx: KnowledgeContext,
    baseId: string,
    teamId: string,
  ): Promise<KnowledgeAccessImpactDto> {
    return this.deps.db.tenant(ctx.orgId, async (tx) => {
      await this.deps.access.require(tx, ctx, baseId, 'manage')
      const [team] = await this.deps.teams.findRefsInTx(tx, ctx.orgId, [teamId])
      if (team === undefined) throw new TeamNotFoundError()
      return {
        team,
        memberCount: await this.deps.repository.teamMemberCount(tx, ctx.orgId, teamId),
        agentCount: 0,
        agents: [],
      }
    })
  }
}
