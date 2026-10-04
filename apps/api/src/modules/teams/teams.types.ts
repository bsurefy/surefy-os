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
export interface TeamOrganizations {
  bumpAccessVersionInTx(tx: DbExecutor, orgId: string): Promise<void>
}

/** Display data of people, from the module that owns `users`. */
export interface TeamUserRefs {
  findUserRefs(userIds: readonly string[]): Promise<ReadonlyMap<string, UserRefDto>>
}
