// SPDX-License-Identifier: AGPL-3.0-only
import type { OrgRole, ProvisioningSource } from '@surefy/contracts'

import type { MembershipRow, MembershipsRepository } from './memberships.repository.js'
import type { DbExecutor } from '@/core/database/index.js'

/** What a membership looks like to the modules that build on it (teams, organizations, access). */
export interface MembershipRef {
  id: string
  userId: string
  role: OrgRole
  status: MembershipRow['status']
  primaryTeamId: string | null
}

export interface NewMembership {
  orgId: string
  userId: string
  role: OrgRole
  provisioningSource: ProvisioningSource
  invitedByUserId?: string | null
}

const toRef = (row: MembershipRow): MembershipRef => ({
  id: row.id,
  userId: row.userId,
  role: row.role,
  status: row.status,
  primaryTeamId: row.primaryTeamId,
})

/**
 * The lowest layer of the members module: transaction-participating reads and writes on
 * `organization_members` that the organizations and teams modules call inside their own
 * transactions. Callers bump the organization's access version in the same transaction.
 */
export class MembershipsService {
  constructor(private readonly membershipsRepository: MembershipsRepository) {}

  /** The creator of a new organization becomes its first Owner (OrganizationOwnerWriter). */
  async insertOwnerInTx(
    tx: DbExecutor,
    input: { orgId: string; userId: string; provisioningSource: ProvisioningSource },
  ): Promise<{ memberId: string }> {
    const row = await this.insertInTx(tx, { ...input, role: 'owner' })
    return { memberId: row.id }
  }

  async insertInTx(tx: DbExecutor, input: NewMembership): Promise<MembershipRef> {
    const row = await this.membershipsRepository.insert(tx, {
      organizationId: input.orgId,
      userId: input.userId,
      role: input.role,
      provisioningSource: input.provisioningSource,
      invitedByUserId: input.invitedByUserId ?? null,
    })
    return toRef(row)
  }

  async findByUserInTx(
    tx: DbExecutor,
    orgId: string,
    userId: string,
  ): Promise<MembershipRef | undefined> {
    const row = await this.membershipsRepository.findByUser(tx, orgId, userId)
    return row === undefined ? undefined : toRef(row)
  }

  /** Active memberships of these people in the organization, by user id. */
  async findActiveByUsersInTx(
    tx: DbExecutor,
    orgId: string,
    userIds: readonly string[],
  ): Promise<Map<string, MembershipRef>> {
    const rows = await this.membershipsRepository.findByUsers(tx, orgId, userIds)
    return new Map(rows.filter((r) => r.status === 'active').map((r) => [r.userId, toRef(r)]))
  }

  /** Primary team default: the first team a member joins. Returns whether it changed. */
  setPrimaryTeamIfNullInTx(
    tx: DbExecutor,
    orgId: string,
    userId: string,
    teamId: string,
  ): Promise<boolean> {
    return this.membershipsRepository.setPrimaryTeamIfNull(tx, orgId, userId, teamId)
  }

  /** Leaving the primary team: the earliest remaining team, or none. Returns whether it changed. */
  replacePrimaryTeamInTx(
    tx: DbExecutor,
    orgId: string,
    userId: string,
    fromTeamId: string,
    toTeamId: string | null,
  ): Promise<boolean> {
    return this.membershipsRepository.replacePrimaryTeam(tx, orgId, userId, fromTeamId, toTeamId)
  }
}
