// SPDX-License-Identifier: AGPL-3.0-only
import { AppError } from '@/core/errors/index.js'
import { decodeCursor, toPage } from '@/lib/pagination.js'
import { TeamNotFoundError } from '@/modules/teams/index.js'
import { AUDIT_ACTIONS, PERMISSIONS } from '@surefy/contracts'
import type {
  BulkMemberActionInput,
  BulkMemberActionResultDto,
  ListMembersQuery,
  MemberDto,
  MeMembershipDto,
  OrgRole,
  RemoveMemberQuery,
  UpdateMemberInput,
} from '@surefy/contracts'

import {
  LastOwnerError,
  MemberNotFoundError,
  OwnerRoleRestrictedError,
  PrimaryTeamOutsideTeamsError,
  TransferTargetInvalidError,
} from './members.errors.js'
import { toMemberDto } from './members.mapper.js'
import {
  memberSort,
  type MembershipPatch,
  type MembershipRow,
  type MembershipsRepository,
} from './memberships/memberships.repository.js'

import type {
  MemberOrganizations,
  MembersContext,
  MemberTeams,
  MemberUsers,
} from './members.types.js'
import type { Database, DbExecutor } from '@/core/database/index.js'
import type { AuditEntryInput, AuditRecorder } from '@/modules/audit/index.js'

export interface MembersServiceDeps {
  db: Database
  membershipsRepository: MembershipsRepository
  organizations: MemberOrganizations
  teams: MemberTeams
  users: MemberUsers
  audit: AuditRecorder
}

/** The audit entries one membership change writes, from the row before and the patch. */
const memberAuditEntries = (target: MembershipRow, patch: MembershipPatch): AuditEntryInput[] => {
  const member = { type: 'member', id: target.id }
  const entries: AuditEntryInput[] = []
  if (patch.role !== undefined) {
    entries.push({
      action: AUDIT_ACTIONS.MEMBER_ROLE_CHANGED,
      target: member,
      metadata: { changes: [{ field: 'role', from: target.role, to: patch.role }] },
    })
  }
  if (patch.primaryTeamId !== undefined) {
    entries.push({
      action: AUDIT_ACTIONS.MEMBER_PRIMARY_TEAM_CHANGED,
      target: member,
      metadata: {
        changes: [{ field: 'primaryTeamId', from: target.primaryTeamId, to: patch.primaryTeamId }],
      },
    })
  }
  if (patch.status === 'deactivated') {
    entries.push({ action: AUDIT_ACTIONS.MEMBER_DEACTIVATED, target: member })
  } else if (patch.status === 'active') {
    entries.push({ action: AUDIT_ACTIONS.MEMBER_REACTIVATED, target: member })
  }
  return entries
}

const canManageOwners = (ctx: MembersContext): boolean =>
  ctx.access.permissions.includes(PERMISSIONS.MEMBERS_MANAGE_ADMINS)

/**
 * Memberships of one organization (organizations-and-members.md, §3): the Members table, roles,
 * primary team, deactivation and removal, with the "at least one active Owner" rule. Every change
 * to who can do what bumps the organization's access version in the same transaction.
 */
export class MembersService {
  constructor(private readonly deps: MembersServiceDeps) {}

  async list(
    ctx: MembersContext,
    query: ListMembersQuery,
  ): Promise<{ items: MemberDto[]; nextCursor: string | null }> {
    const { items, nextCursor, teams } = await this.deps.db.tenant(ctx.orgId, async (tx) => {
      const rows = await this.deps.membershipsRepository.listPage(tx, ctx.orgId, {
        limit: query.limit,
        sort: memberSort(query.sort),
        ...(query.cursor === undefined ? {} : { cursor: decodeCursor(query.cursor) }),
        ...(query.q === undefined ? {} : { q: query.q }),
        ...(query.role === undefined ? {} : { roles: query.role }),
        ...(query.status === undefined ? {} : { statuses: query.status }),
        ...(query.teamId === undefined ? {} : { teamId: query.teamId }),
      })
      const page = toPage(rows, query.limit, (row) => ({ k: row.sortKey, id: row.membership.id }))
      const memberships = page.items.map((row) => row.membership)
      return { ...page, items: memberships, teams: await this.teamsOf(tx, ctx.orgId, memberships) }
    })
    return { items: await this.toDtos(items, teams), nextCursor }
  }

  async get(ctx: MembersContext, memberId: string): Promise<MemberDto> {
    const { row, teams } = await this.deps.db.tenant(ctx.orgId, async (tx) => {
      const found = await this.findOrThrow(tx, ctx.orgId, memberId)
      return { row: found, teams: await this.teamsOf(tx, ctx.orgId, [found]) }
    })
    return this.toDto(row, teams)
  }

  /** Role (Owners only change Owners) and primary team (one of the member's teams). */
  async update(
    ctx: MembersContext,
    memberId: string,
    input: UpdateMemberInput,
  ): Promise<MemberDto> {
    return this.mutate(ctx, memberId, async (tx, target) => {
      const patch: MembershipPatch = {}
      if (input.role !== undefined && input.role !== target.role) {
        await this.assertRoleChange(tx, ctx, target, input.role)
        patch.role = input.role
      }
      if (input.primaryTeamId !== undefined && input.primaryTeamId !== target.primaryTeamId) {
        if (
          input.primaryTeamId !== null &&
          !(await this.deps.teams.isMemberOfTeamInTx(
            tx,
            ctx.orgId,
            input.primaryTeamId,
            target.userId,
          ))
        ) {
          throw new PrimaryTeamOutsideTeamsError()
        }
        patch.primaryTeamId = input.primaryTeamId
      }
      return patch
    })
  }

  /** Keeps role and teams, so reactivation restores them. */
  async deactivate(ctx: MembersContext, memberId: string): Promise<MemberDto> {
    return this.mutate(ctx, memberId, (tx, target) => this.deactivationPatch(tx, ctx, target))
  }

  async reactivate(ctx: MembersContext, memberId: string): Promise<MemberDto> {
    return this.mutate(ctx, memberId, (_tx, target) => {
      if (target.status === 'active') return Promise.resolve({})
      if (target.role === 'owner' && !canManageOwners(ctx)) {
        return Promise.reject(new OwnerRoleRestrictedError())
      }
      return Promise.resolve({ status: 'active', deactivatedAt: null, deactivatedByUserId: null })
    })
  }

  /**
   * Removes the membership. The delete cascades to team memberships, member preferences and
   * notifications. Agents, flows and personal credentials move or are revoked here as their
   * modules arrive (`transferToUserId`).
   */
  async remove(ctx: MembersContext, memberId: string, query: RemoveMemberQuery): Promise<void> {
    await this.deps.db.tenant(ctx.orgId, async (tx) => {
      const target = await this.findOrThrow(tx, ctx.orgId, memberId)
      if (target.role === 'owner') {
        if (!canManageOwners(ctx)) throw new OwnerRoleRestrictedError()
        if (target.status === 'active') await this.assertNotLastOwner(tx, ctx.orgId, target.id)
      }
      if (query.transferToUserId !== undefined) {
        const heir = await this.deps.membershipsRepository.findByUser(
          tx,
          ctx.orgId,
          query.transferToUserId,
        )
        if (heir?.status !== 'active' || heir.id === target.id) {
          throw new TransferTargetInvalidError()
        }
      }
      await this.deps.teams.clearLeadForUserInTx(tx, ctx.orgId, target.userId)
      await this.deps.membershipsRepository.delete(tx, ctx.orgId, target.id)
      await this.deps.organizations.bumpAccessVersionInTx(tx, ctx.orgId)
      await this.deps.audit.record(tx, ctx, {
        action: AUDIT_ACTIONS.MEMBER_REMOVED,
        target: { type: 'member', id: target.id },
        metadata: {
          refs: {
            userId: target.userId,
            ...(query.transferToUserId === undefined
              ? {}
              : { transferToUserId: query.transferToUserId }),
          },
          labels: { role: target.role },
        },
      })
    })
  }

  /** One action on several members; each row changes in its own transaction or is skipped. */
  async bulk(
    ctx: MembersContext,
    input: BulkMemberActionInput,
  ): Promise<BulkMemberActionResultDto> {
    if (input.action === 'add-to-team') {
      const [team] = await this.deps.db.tenant(ctx.orgId, (tx) =>
        this.deps.teams.findRefsInTx(tx, ctx.orgId, [input.teamId]),
      )
      if (team === undefined) throw new TeamNotFoundError()
    }
    const result: BulkMemberActionResultDto = { affected: 0, skipped: [] }
    for (const memberId of new Set(input.memberIds)) {
      try {
        await this.bulkOne(ctx, memberId, input)
        result.affected += 1
      } catch (error) {
        if (!(error instanceof AppError)) throw error
        result.skipped.push({ memberId, code: error.code })
      }
    }
    return result
  }

  /** `/me`: the person's active memberships with their organizations (auth `MembershipsReader`). */
  async listActiveMemberships(userId: string): Promise<MeMembershipDto[]> {
    const rows = await this.deps.db.user(userId, (tx) =>
      this.deps.membershipsRepository.listActiveForUser(tx, userId),
    )
    return Promise.all(
      rows.map(async (row) => ({
        organization: {
          id: row.organizationId,
          name: row.name,
          slug: row.slug,
          logoUrl: await this.deps.organizations.logoUrl(row.logoObjectKey),
          status: row.status,
        },
        role: row.role,
        primaryTeamId: row.primaryTeamId,
        joinedAt: row.joinedAt.toISOString(),
      })),
    )
  }

  // ---- Private ------------------------------------------------------------------------------

  private async bulkOne(
    ctx: MembersContext,
    memberId: string,
    input: BulkMemberActionInput,
  ): Promise<void> {
    if (input.action === 'change-role') {
      await this.update(ctx, memberId, { role: input.role })
    } else if (input.action === 'deactivate') {
      await this.deactivate(ctx, memberId)
    } else {
      await this.deps.db.tenant(ctx.orgId, async (tx) => {
        const target = await this.findOrThrow(tx, ctx.orgId, memberId)
        if (target.status !== 'active') throw new MemberNotFoundError()
        const added = await this.deps.teams.addMemberToTeamsInTx(
          tx,
          ctx.orgId,
          target.userId,
          [input.teamId],
          ctx.userId,
        )
        if (added > 0) {
          await this.deps.organizations.bumpAccessVersionInTx(tx, ctx.orgId)
          await this.deps.audit.record(tx, ctx, {
            action: AUDIT_ACTIONS.TEAM_MEMBER_ADDED,
            target: { type: 'team', id: input.teamId },
            metadata: { refs: { userId: target.userId } },
          })
        }
      })
    }
  }

  /** Loads the member, applies the patch the rule returns and bumps the access version. */
  private async mutate(
    ctx: MembersContext,
    memberId: string,
    rule: (tx: DbExecutor, target: MembershipRow) => Promise<MembershipPatch>,
  ): Promise<MemberDto> {
    const { row, teams } = await this.deps.db.tenant(ctx.orgId, async (tx) => {
      const target = await this.findOrThrow(tx, ctx.orgId, memberId)
      const patch = await rule(tx, target)
      let updated = target
      if (Object.keys(patch).length > 0) {
        updated =
          (await this.deps.membershipsRepository.update(tx, ctx.orgId, memberId, patch)) ?? target
        await this.deps.organizations.bumpAccessVersionInTx(tx, ctx.orgId)
        for (const entry of memberAuditEntries(target, patch)) {
          await this.deps.audit.record(tx, ctx, entry)
        }
      }
      return { row: updated, teams: await this.teamsOf(tx, ctx.orgId, [updated]) }
    })
    return this.toDto(row, teams)
  }

  private async deactivationPatch(
    tx: DbExecutor,
    ctx: MembersContext,
    target: MembershipRow,
  ): Promise<MembershipPatch> {
    if (target.status === 'deactivated') return {}
    if (target.role === 'owner') {
      if (!canManageOwners(ctx)) throw new OwnerRoleRestrictedError()
      await this.assertNotLastOwner(tx, ctx.orgId, target.id)
    }
    return { status: 'deactivated', deactivatedAt: new Date(), deactivatedByUserId: ctx.userId }
  }

  private async assertRoleChange(
    tx: DbExecutor,
    ctx: MembersContext,
    target: MembershipRow,
    role: OrgRole,
  ): Promise<void> {
    if ((target.role === 'owner' || role === 'owner') && !canManageOwners(ctx)) {
      throw new OwnerRoleRestrictedError()
    }
    if (target.role === 'owner' && target.status === 'active') {
      await this.assertNotLastOwner(tx, ctx.orgId, target.id)
    }
  }

  /** Locks the active Owners; refuses when `memberId` is the only one left. */
  private async assertNotLastOwner(tx: DbExecutor, orgId: string, memberId: string) {
    const owners = await this.deps.membershipsRepository.lockActiveOwners(tx, orgId)
    if (owners.every((id) => id === memberId)) throw new LastOwnerError()
  }

  private async findOrThrow(tx: DbExecutor, orgId: string, memberId: string) {
    const row = await this.deps.membershipsRepository.findById(tx, orgId, memberId)
    if (row === undefined) throw new MemberNotFoundError()
    return row
  }

  private teamsOf(tx: DbExecutor, orgId: string, rows: readonly MembershipRow[]) {
    return this.deps.teams.listRefsByUsersInTx(
      tx,
      orgId,
      rows.map((row) => row.userId),
    )
  }

  private async toDto(
    row: MembershipRow,
    teams: Awaited<ReturnType<MembersService['teamsOf']>>,
  ): Promise<MemberDto> {
    const [dto] = await this.toDtos([row], teams)
    if (dto === undefined) throw new MemberNotFoundError() // the account was deleted meanwhile
    return dto
  }

  private async toDtos(
    rows: readonly MembershipRow[],
    teams: Awaited<ReturnType<MembersService['teamsOf']>>,
  ): Promise<MemberDto[]> {
    const profiles = await this.deps.users.findMemberProfiles(rows.map((row) => row.userId))
    return rows.flatMap((row) => {
      const profile = profiles.get(row.userId)
      return profile === undefined ? [] : [toMemberDto(row, profile, teams.get(row.userId) ?? [])]
    })
  }
}
