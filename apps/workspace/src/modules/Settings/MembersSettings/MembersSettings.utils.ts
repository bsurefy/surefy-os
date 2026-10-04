// SPDX-License-Identifier: AGPL-3.0-only
import { ORG_ROLES } from '@surefy/contracts'
import type { InvitationDto, MemberDto, OrgRole } from '@surefy/contracts'

import type { MemberStatusFilter } from './MembersSettings.constants'
import type { MemberRow } from './MembersSettings.types'

const MEMBER_PREFIX = 'member:'
const INVITATION_PREFIX = 'invitation:'

export interface MemberRowFilters {
  role?: OrgRole | null
  teamId?: string | null
  status: MemberStatusFilter
}

/**
 * The table's rows: pending invitations first, then people. Invitations answer the role and team
 * filters here (the API filters members itself) and disappear under Active and Deactivated.
 */
export function buildMemberRows(
  members: MemberDto[],
  invitations: InvitationDto[],
  { role, teamId, status }: MemberRowFilters,
): MemberRow[] {
  const showInvitations = status === 'all' || status === 'invited'
  const showMembers = status !== 'invited'
  const invitationRows: MemberRow[] = showInvitations
    ? invitations
        .filter(
          (invitation) =>
            (!role || invitation.role === role) &&
            (!teamId || invitation.teams.some((team) => team.id === teamId)),
        )
        .map((invitation) => ({
          kind: 'invitation',
          id: `${INVITATION_PREFIX}${invitation.id}`,
          invitation,
        }))
    : []
  const memberRows: MemberRow[] = showMembers
    ? members.map((member) => ({ kind: 'member', id: `${MEMBER_PREFIX}${member.id}`, member }))
    : []
  return [...invitationRows, ...memberRows]
}

/** The ids of the people among the selected rows (invitations cannot be changed in bulk). */
export function getSelectedMemberIds(selection: Record<string, true>): string[] {
  return Object.keys(selection)
    .filter((id) => id.startsWith(MEMBER_PREFIX))
    .map((id) => id.slice(MEMBER_PREFIX.length))
}

/** True when moving from `from` to `to` raises the person's rights. */
export function isPromotion(from: OrgRole, to: OrgRole): boolean {
  return ORG_ROLES.indexOf(to) > ORG_ROLES.indexOf(from)
}

/**
 * Role changes that need the "Confirm with impact" step (T2, settings.md): promotion to Admin or
 * Owner, and any demotion. Between User and Builder upward is a plain change.
 */
export function isRoleChangeT2(from: OrgRole, to: OrgRole): boolean {
  if (from === to) return false
  if (!isPromotion(from, to)) return true
  return to === 'admin' || to === 'owner'
}

/** The warning a role change shows before it is confirmed, or null when it needs none. */
export function getRoleChangeImpactKey(
  from: OrgRole | undefined,
  to: OrgRole,
): 'promoteImpact' | 'demoteImpact' | null {
  if (from === undefined || !isRoleChangeT2(from, to)) return null
  return isPromotion(from, to) ? 'promoteImpact' : 'demoteImpact'
}

/** The status the table shows for a person or an invitation. */
export function getRowStatus(
  row: MemberRow,
): 'active' | 'deactivated' | 'invited' | 'notDelivered' {
  if (row.kind === 'member') return row.member.status
  const { deliveryStatus } = row.invitation
  return deliveryStatus === 'failed' || deliveryStatus === 'bounced' ? 'notDelivered' : 'invited'
}

/** Addresses from a pasted list: commas, semicolons, spaces and line breaks separate them. */
export function parseEmails(text: string): string[] {
  const seen = new Set<string>()
  for (const part of text.split(/[\s,;]+/)) {
    const email = part.trim().toLowerCase()
    if (email) seen.add(email)
  }
  return [...seen]
}

export function toSortParam(sort: string): { id: string; desc: boolean } {
  return { id: sort.replace(/^-/, ''), desc: sort.startsWith('-') }
}
