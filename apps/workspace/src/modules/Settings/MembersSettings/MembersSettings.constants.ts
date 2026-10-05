// SPDX-License-Identifier: AGPL-3.0-only
import { ORG_ROLES } from '@surefy/contracts'

/** What the status filter offers: invitations are "Invited", memberships are Active or Deactivated. */
export const MEMBER_STATUS_FILTERS = ['all', 'active', 'invited', 'deactivated'] as const
export type MemberStatusFilter = (typeof MEMBER_STATUS_FILTERS)[number]

export const MEMBER_SORTS = ['name', '-name', 'lastActiveAt', '-lastActiveAt'] as const
export type MemberSort = (typeof MEMBER_SORTS)[number]

/** The roles in the order the pickers list them: lowest first. */
export const ASSIGNABLE_ROLES = ORG_ROLES

/** Invitations are loaded in one page: the table shows all that are pending. */
export const INVITATIONS_PAGE_SIZE = 100

/** Most addresses one invite dialog accepts; each becomes its own request. */
export const INVITE_EMAILS_MAX = 50

/** The dialogs of the Members screen; one is open at a time. */
export const MEMBER_DIALOG = {
  INVITE: 'invite',
  CHANGE_ROLE: 'changeRole',
  PRIMARY_TEAM: 'primaryTeam',
  DEACTIVATE: 'deactivate',
  REMOVE: 'remove',
  REVOKE_INVITATION: 'revokeInvitation',
  BULK_ROLE: 'bulkRole',
  BULK_TEAM: 'bulkTeam',
  BULK_DEACTIVATE: 'bulkDeactivate',
} as const
export type MemberDialogKind = (typeof MEMBER_DIALOG)[keyof typeof MEMBER_DIALOG]
