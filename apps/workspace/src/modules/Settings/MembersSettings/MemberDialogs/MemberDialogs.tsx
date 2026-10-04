// SPDX-License-Identifier: AGPL-3.0-only
'use client'

import { MEMBER_DIALOG } from '../MembersSettings.constants'
import ChangeRoleDialog from './ChangeRoleDialog'
import {
  BulkDeactivateDialog,
  DeactivateMemberDialog,
  RevokeInvitationDialog,
} from './ConfirmMemberDialogs'
import InviteMembersDialog from './InviteMembersDialog'
import RemoveMemberDialog from './RemoveMemberDialog'
import TeamPickerDialog from './TeamPickerDialog'

import type { OpenDialog } from '../MembersSettings.controller'

interface MemberDialogsProps {
  orgId: string
  dialog: OpenDialog | null
  selectedMemberIds: string[]
  canManageAdmins: boolean
  onClose: () => void
}

/** Renders the open dialog of the Members screen, if any. */
export default function MemberDialogs({
  orgId,
  dialog,
  selectedMemberIds,
  canManageAdmins,
  onClose,
}: Readonly<MemberDialogsProps>) {
  if (!dialog) return null
  const { kind, row } = dialog
  const member = row?.kind === 'member' ? row.member : undefined
  const invitation = row?.kind === 'invitation' ? row.invitation : undefined
  const shared = { orgId, onClose }

  switch (kind) {
    case MEMBER_DIALOG.INVITE:
      return <InviteMembersDialog {...shared} canManageAdmins={canManageAdmins} />
    case MEMBER_DIALOG.CHANGE_ROLE:
      return member ? (
        <ChangeRoleDialog {...shared} members={[member]} canManageAdmins={canManageAdmins} />
      ) : null
    case MEMBER_DIALOG.BULK_ROLE:
      return (
        <ChangeRoleDialog
          {...shared}
          members={{ count: selectedMemberIds.length, ids: selectedMemberIds }}
          canManageAdmins={canManageAdmins}
        />
      )
    case MEMBER_DIALOG.PRIMARY_TEAM:
      return member ? <TeamPickerDialog {...shared} mode="primary" member={member} /> : null
    case MEMBER_DIALOG.BULK_TEAM:
      return <TeamPickerDialog {...shared} mode="bulk" memberIds={selectedMemberIds} />
    case MEMBER_DIALOG.REMOVE:
      return member ? <RemoveMemberDialog {...shared} member={member} /> : null
    case MEMBER_DIALOG.DEACTIVATE:
      return member ? <DeactivateMemberDialog {...shared} member={member} /> : null
    case MEMBER_DIALOG.BULK_DEACTIVATE:
      return <BulkDeactivateDialog {...shared} memberIds={selectedMemberIds} />
    case MEMBER_DIALOG.REVOKE_INVITATION:
      return invitation ? <RevokeInvitationDialog {...shared} invitation={invitation} /> : null
    default:
      return null
  }
}
