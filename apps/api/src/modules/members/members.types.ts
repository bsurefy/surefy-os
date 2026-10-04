// SPDX-License-Identifier: AGPL-3.0-only
import type { AuthUsersService } from '@/modules/auth/index.js'
import type { NotificationsService } from '@/modules/notifications/index.js'
import type { OrganizationsService } from '@/modules/organizations/index.js'
import type { TeamsService } from '@/modules/teams/index.js'
import type { EffectiveAccess, TenantContext } from '@/types/context.js'

/**
 * What the services need from the request's `TenantContext`: the organization, who acts (`null`
 * for API keys) and their permissions, which decide the rules about Owners.
 */
export type MembersContext = Pick<TenantContext, 'orgId' | 'userId'> & {
  access: Pick<EffectiveAccess, 'permissions'>
}

/** Identity reads from the auth module. */
export type MemberUsers = Pick<AuthUsersService, 'findById' | 'findUserRefs' | 'findMemberProfiles'>

/** The organizations module: access version, the organization itself and its logo. */
export type MemberOrganizations = Pick<
  OrganizationsService,
  'bumpAccessVersionInTx' | 'getInTx' | 'logoUrl'
>

/** The teams module's transaction-participating team membership reads and writes. */
export type MemberTeams = Pick<
  TeamsService,
  | 'addMemberToTeamsInTx'
  | 'isMemberOfTeamInTx'
  | 'findRefsInTx'
  | 'listRefsByUsersInTx'
  | 'clearLeadForUserInTx'
>

/** Invitation emails and the inviter's notification. */
export type MemberNotifications = Pick<NotificationsService, 'queueEmail' | 'notify'>
