// SPDX-License-Identifier: AGPL-3.0-only
import type { MemberDto, OrgRole } from '@surefy/contracts'

export interface InviteMembersDialogProps {
  orgId: string
  /** Only Owners invite Owners. */
  canManageAdmins: boolean
  onClose: () => void
}

export interface ChangeRoleDialogProps {
  orgId: string
  /** One person, or the selected people (`members`). */
  members: MemberDto[] | { count: number; ids: string[] }
  currentRole?: OrgRole
  canManageAdmins: boolean
  onClose: () => void
}

export interface InviteResult {
  email: string
  /** The translated reason it failed; undefined when the invitation was created. */
  error?: string
  invitationId?: string
  /** The email could not be delivered: offer the link instead. */
  isUndelivered?: boolean
}
