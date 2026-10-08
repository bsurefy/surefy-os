// SPDX-License-Identifier: AGPL-3.0-only
import type { OrgRole, UserRefDto } from '@surefy/contracts'

import type { DbExecutor } from '@/core/database/index.js'

/** What the service needs from the request: the verified organization and who acts. */
export interface TeamsContext {
  orgId: string
  userId: string | null
}

/** A membership as the teams module sees it (members module, `MembershipsService`). */
export interface TeamMembershipRef {
  userId: string
  role: OrgRole
  primaryTeamId: string | null
}

/**
 * The members module's transaction-participating membership primitives: who is an active member,
 * and the primary team rules (organizations-and-members.md, Primary team).
 */
export interface TeamMemberships {
  findActiveByUsersInTx(
    tx: DbExecutor,
    orgId: string,
    userIds: readonly string[],
  ): Promise<ReadonlyMap<string, TeamMembershipRef>>
  setPrimaryTeamIfNullInTx(
    tx: DbExecutor,
    orgId: string,
    userId: string,
    teamId: string,
  ): Promise<boolean>
  replacePrimaryTeamInTx(
    tx: DbExecutor,
    orgId: string,
    userId: string,
    fromTeamId: string,
    toTeamId: string | null,
  ): Promise<boolean>
}

/** The organizations module's access version bump, in the caller's transaction. */
/**
 * What another module does in the transaction that deletes a team, before the delete (approvals
 * add role `admin` to approvals that only the team could decide). Read when used, because those
 * modules are built after teams.
 */
export interface TeamDeletionStep {
  onDeleteInTx(tx: DbExecutor, orgId: string, teamId: string): Promise<void>
}

/**
 * Team-scoped connections (connections module), counted in the deletion dialog. Read when used,
 * because the connections module is built after teams.
 */
export interface TeamConnections {
  countForTeam(tx: DbExecutor, orgId: string, teamId: string): Promise<number>
}

export interface TeamOrganizations {
  bumpAccessVersionInTx(tx: DbExecutor, orgId: string): Promise<void>
}

/** Display data of people, from the module that owns `users`. */
export interface TeamUserRefs {
  findUserRefs(userIds: readonly string[]): Promise<ReadonlyMap<string, UserRefDto>>
}
