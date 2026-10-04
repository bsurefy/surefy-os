// SPDX-License-Identifier: AGPL-3.0-only
import { sqlState, type Database, type DbExecutor } from '@/core/database/index.js'
import { decodeCursor, toPage } from '@/lib/pagination.js'
import { AUDIT_ACTIONS } from '@surefy/contracts'
import type {
  AddTeamMembersInput,
  AddTeamMembersResultDto,
  CreateTeamInput,
  ListTeamMembersQuery,
  ListTeamsQuery,
  TeamDeletionImpactDto,
  TeamDto,
  TeamMemberDto,
  TeamRefDto,
  UpdateTeamInput,
} from '@surefy/contracts'

import {
  TeamCandidateNotMemberError,
  TeamLeadOutsideTeamError,
  TeamMemberNotFoundError,
  TeamNameTakenError,
  TeamNotFoundError,
} from './teams.errors.js'
import { toTeamDto, toTeamMemberDto, toTeamRefDto } from './teams.mapper.js'
import { teamSort, type TeamRow, type TeamsRepository } from './teams.repository.js'

import type {
  TeamMemberships,
  TeamOrganizations,
  TeamsContext,
  TeamUserRefs,
} from './teams.types.js'
import type { AuditRecorder } from '@/modules/audit/index.js'

export interface TeamsServiceDeps {
  db: Database
  teamsRepository: TeamsRepository
  memberships: TeamMemberships
  organizations: TeamOrganizations
  users: TeamUserRefs
  audit: AuditRecorder
}

const UNIQUE_VIOLATION = '23505'

/** Non-secret field changes of a team, for the audit entry. */
const teamChanges = (before: TeamRow, after: TeamRow) =>
  (['name', 'description', 'leadUserId'] as const).flatMap((field) =>
    before[field] === after[field] ? [] : [{ field, from: before[field], to: after[field] }],
  )

const nameConflict = (error: unknown): never => {
  if (sqlState(error) === UNIQUE_VIOLATION) throw new TeamNameTakenError()
  throw error
}

/**
 * Teams and team membership (organizations-and-members.md, §6–7). Every change to who is in a
 * team bumps the organization's access version and applies the primary team rules in the same
 * transaction.
 */
export class TeamsService {
  constructor(private readonly deps: TeamsServiceDeps) {}

  async list(
    ctx: TeamsContext,
    query: ListTeamsQuery,
  ): Promise<{ items: TeamDto[]; nextCursor: string | null }> {
    const sort = teamSort(query.sort)
    const rows = await this.deps.db.tenant(ctx.orgId, (tx) =>
      this.deps.teamsRepository.listPage(tx, ctx.orgId, {
        limit: query.limit,
        sort,
        ...(query.q === undefined ? {} : { q: query.q }),
        ...(query.cursor === undefined ? {} : { cursor: decodeCursor(query.cursor) }),
      }),
    )
    const { items, nextCursor } = toPage(rows, query.limit, (row) => ({
      k: row.sortKey,
      id: row.team.id,
    }))
    return { items: items.map((row) => toTeamDto(row.team, row)), nextCursor }
  }

  async get(ctx: TeamsContext, teamId: string): Promise<TeamDto> {
    return this.deps.db.tenant(ctx.orgId, async (tx) =>
      this.toDto(tx, ctx.orgId, await this.findOrThrow(tx, ctx.orgId, teamId)),
    )
  }

  /** The lead must be among the members added in the same request. */
  async create(ctx: TeamsContext, input: CreateTeamInput): Promise<TeamDto> {
    const memberUserIds = [...new Set(input.memberUserIds)]
    if (input.leadUserId !== undefined && !memberUserIds.includes(input.leadUserId)) {
      throw new TeamLeadOutsideTeamError()
    }
    const repository = this.deps.teamsRepository
    return this.deps.db
      .tenant(ctx.orgId, async (tx) => {
        if (await repository.existsByName(tx, ctx.orgId, input.name)) throw new TeamNameTakenError()
        await this.assertActiveMembers(tx, ctx.orgId, memberUserIds)
        const team = await repository.insert(tx, {
          organizationId: ctx.orgId,
          name: input.name,
          description: input.description ?? null,
          leadUserId: input.leadUserId ?? null,
          createdByUserId: ctx.userId,
        })
        if (memberUserIds.length > 0) {
          await this.insertMembersInTx(tx, ctx.orgId, team.id, memberUserIds, ctx.userId)
          await this.deps.organizations.bumpAccessVersionInTx(tx, ctx.orgId)
        }
        await this.deps.audit.record(tx, ctx, {
          action: AUDIT_ACTIONS.TEAM_CREATED,
          target: { type: 'team', id: team.id },
          metadata: { counts: { members: memberUserIds.length } },
        })
        return this.toDto(tx, ctx.orgId, team)
      })
      .catch(nameConflict)
  }

  async update(ctx: TeamsContext, teamId: string, input: UpdateTeamInput): Promise<TeamDto> {
    const repository = this.deps.teamsRepository
    return this.deps.db
      .tenant(ctx.orgId, async (tx) => {
        const current = await this.findOrThrow(tx, ctx.orgId, teamId)
        if (
          input.name !== undefined &&
          (await repository.existsByName(tx, ctx.orgId, input.name, teamId))
        ) {
          throw new TeamNameTakenError()
        }
        if (
          input.leadUserId != null &&
          !(await repository.isMember(tx, ctx.orgId, teamId, input.leadUserId))
        ) {
          throw new TeamLeadOutsideTeamError()
        }
        const row = await repository.update(tx, ctx.orgId, teamId, {
          ...(input.name === undefined ? {} : { name: input.name }),
          ...(input.description === undefined ? {} : { description: input.description }),
          ...(input.leadUserId === undefined ? {} : { leadUserId: input.leadUserId }),
        })
        if (row === undefined) throw new TeamNotFoundError()
        await this.deps.audit.record(tx, ctx, {
          action: AUDIT_ACTIONS.TEAM_UPDATED,
          target: { type: 'team', id: teamId },
          metadata: { changes: teamChanges(current, row) },
        })
        return this.toDto(tx, ctx.orgId, row)
      })
      .catch(nameConflict)
  }

  /**
   * Deletes the team; the database cascades its memberships and invitation targets and clears
   * the primary team of members charged to it. Team-scoped connections arrive with the
   * connections module, which then moves or removes them first (`connections` query).
   */
  async delete(ctx: TeamsContext, teamId: string): Promise<void> {
    await this.deps.db.tenant(ctx.orgId, async (tx) => {
      if (!(await this.deps.teamsRepository.delete(tx, ctx.orgId, teamId))) {
        throw new TeamNotFoundError()
      }
      await this.deps.organizations.bumpAccessVersionInTx(tx, ctx.orgId)
      await this.deps.audit.record(tx, ctx, {
        action: AUDIT_ACTIONS.TEAM_DELETED,
        target: { type: 'team', id: teamId },
      })
    })
  }

  /** What the T2 dialog lists before deleting a team. */
  async deletionImpact(ctx: TeamsContext, teamId: string): Promise<TeamDeletionImpactDto> {
    return this.deps.db.tenant(ctx.orgId, async (tx) => {
      await this.findOrThrow(tx, ctx.orgId, teamId)
      const counts = await this.deps.teamsRepository.counts(tx, ctx.orgId, teamId)
      // Connections and other dependents (dependency_edges) arrive with their modules.
      return { ...counts, connectionCount: 0, dependents: [] }
    })
  }

  async listMembers(
    ctx: TeamsContext,
    teamId: string,
    query: ListTeamMembersQuery,
  ): Promise<{ items: TeamMemberDto[]; nextCursor: string | null }> {
    const { team, rows } = await this.deps.db.tenant(ctx.orgId, async (tx) => ({
      team: await this.findOrThrow(tx, ctx.orgId, teamId),
      rows: await this.deps.teamsRepository.listMembersPage(tx, ctx.orgId, teamId, {
        limit: query.limit,
        ...(query.q === undefined ? {} : { q: query.q }),
        ...(query.cursor === undefined ? {} : { cursor: decodeCursor(query.cursor) }),
      }),
    }))
    const { items, nextCursor } = toPage(rows, query.limit, (row) => ({
      k: row.sortKey,
      id: row.userId,
    }))
    const refs = await this.deps.users.findUserRefs(items.map((row) => row.userId))
    return {
      items: items.flatMap((row) => {
        const user = refs.get(row.userId)
        return user === undefined ? [] : [toTeamMemberDto(row, team, user)]
      }),
      nextCursor,
    }
  }

  /** Active members of the organization only; people already in the team are skipped. */
  async addMembers(
    ctx: TeamsContext,
    teamId: string,
    input: AddTeamMembersInput,
  ): Promise<AddTeamMembersResultDto> {
    const userIds = [...new Set(input.userIds)]
    return this.deps.db.tenant(ctx.orgId, async (tx) => {
      await this.findOrThrow(tx, ctx.orgId, teamId)
      await this.assertActiveMembers(tx, ctx.orgId, userIds)
      const added = await this.insertMembersInTx(tx, ctx.orgId, teamId, userIds, ctx.userId)
      if (added > 0) {
        await this.deps.organizations.bumpAccessVersionInTx(tx, ctx.orgId)
        await this.deps.audit.record(tx, ctx, {
          action: AUDIT_ACTIONS.TEAM_MEMBER_ADDED,
          target: { type: 'team', id: teamId },
          metadata: { counts: { added } },
        })
      }
      return { added }
    })
  }

  /**
   * Leaving a team: the lead is cleared, and a member charged to this team moves to their
   * earliest remaining team, or to none.
   */
  async removeMember(ctx: TeamsContext, teamId: string, userId: string): Promise<void> {
    const repository = this.deps.teamsRepository
    await this.deps.db.tenant(ctx.orgId, async (tx) => {
      await this.findOrThrow(tx, ctx.orgId, teamId)
      if (!(await repository.deleteMember(tx, ctx.orgId, teamId, userId))) {
        throw new TeamMemberNotFoundError()
      }
      await repository.clearLead(tx, ctx.orgId, userId, teamId)
      const [next] = await repository.listTeamIdsForUser(tx, ctx.orgId, userId)
      await this.deps.memberships.replacePrimaryTeamInTx(
        tx,
        ctx.orgId,
        userId,
        teamId,
        next ?? null,
      )
      await this.deps.organizations.bumpAccessVersionInTx(tx, ctx.orgId)
      await this.deps.audit.record(tx, ctx, {
        action: AUDIT_ACTIONS.TEAM_MEMBER_REMOVED,
        target: { type: 'team', id: teamId },
        metadata: { refs: { userId } },
      })
    })
  }

  // ---- Transaction-participating, for the members module -----------------------------------

  /**
   * Adds one member to teams in the given order (invitation acceptance): the first becomes the
   * primary team when the member has none. Teams of another organization are refused by the
   * composite foreign key. The caller bumps the access version.
   */
  async addMemberToTeamsInTx(
    tx: DbExecutor,
    orgId: string,
    userId: string,
    teamIds: readonly string[],
    addedByUserId: string | null,
  ): Promise<number> {
    let added = 0
    for (const teamId of teamIds) {
      added += await this.insertMembersInTx(tx, orgId, teamId, [userId], addedByUserId)
    }
    return added
  }

  /** "My teams" for effective access, earliest joined first. */
  listTeamIdsForUserInTx(tx: DbExecutor, orgId: string, userId: string): Promise<string[]> {
    return this.deps.teamsRepository.listTeamIdsForUser(tx, orgId, userId)
  }

  isMemberOfTeamInTx(
    tx: DbExecutor,
    orgId: string,
    teamId: string,
    userId: string,
  ): Promise<boolean> {
    return this.deps.teamsRepository.isMember(tx, orgId, teamId, userId)
  }

  /** The teams that exist, in the order asked for; unknown ids are left out. */
  async findRefsInTx(
    tx: DbExecutor,
    orgId: string,
    teamIds: readonly string[],
  ): Promise<TeamRefDto[]> {
    const rows = await this.deps.teamsRepository.findRefs(tx, orgId, teamIds)
    const byId = new Map(rows.map((row) => [row.id, toTeamRefDto(row)]))
    return teamIds.flatMap((id) => {
      const ref = byId.get(id)
      return ref === undefined ? [] : [ref]
    })
  }

  /** Each person's teams, earliest joined first. */
  async listRefsByUsersInTx(
    tx: DbExecutor,
    orgId: string,
    userIds: readonly string[],
  ): Promise<Map<string, TeamRefDto[]>> {
    const refs = new Map<string, TeamRefDto[]>()
    for (const row of await this.deps.teamsRepository.listRefsByUsers(tx, orgId, userIds)) {
      const list = refs.get(row.userId) ?? []
      list.push(toTeamRefDto(row))
      refs.set(row.userId, list)
    }
    return refs
  }

  /** The person left the organization: no team keeps them as its lead. */
  clearLeadForUserInTx(tx: DbExecutor, orgId: string, userId: string): Promise<void> {
    return this.deps.teamsRepository.clearLead(tx, orgId, userId)
  }

  // ---- Private ------------------------------------------------------------------------------

  private async findOrThrow(tx: DbExecutor, orgId: string, teamId: string): Promise<TeamRow> {
    const team = await this.deps.teamsRepository.findById(tx, orgId, teamId)
    if (team === undefined) throw new TeamNotFoundError()
    return team
  }

  private async assertActiveMembers(
    tx: DbExecutor,
    orgId: string,
    userIds: readonly string[],
  ): Promise<void> {
    const active = await this.deps.memberships.findActiveByUsersInTx(tx, orgId, userIds)
    if (userIds.some((userId) => !active.has(userId))) throw new TeamCandidateNotMemberError()
  }

  /** Inserts team memberships and applies the primary team default; returns how many were new. */
  private async insertMembersInTx(
    tx: DbExecutor,
    orgId: string,
    teamId: string,
    userIds: readonly string[],
    addedByUserId: string | null,
  ): Promise<number> {
    const added = await this.deps.teamsRepository.insertMembers(
      tx,
      userIds.map((userId) => ({ organizationId: orgId, teamId, userId, addedByUserId })),
    )
    for (const userId of added) {
      await this.deps.memberships.setPrimaryTeamIfNullInTx(tx, orgId, userId, teamId)
    }
    return added.length
  }

  private async toDto(tx: DbExecutor, orgId: string, team: TeamRow): Promise<TeamDto> {
    return toTeamDto(team, await this.deps.teamsRepository.counts(tx, orgId, team.id))
  }
}
