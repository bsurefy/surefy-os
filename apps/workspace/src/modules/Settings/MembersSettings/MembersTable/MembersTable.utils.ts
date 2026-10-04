// SPDX-License-Identifier: AGPL-3.0-only
import type { MemberRow } from '../MembersSettings.types'

export interface RowPermissions {
  canManage: boolean
  canManageAdmins: boolean
  currentUserId: string | undefined
}

/** Whether the person may change this person at all: Owners only by Owners, never one's own row. */
export function canChangeMember(row: MemberRow, permissions: RowPermissions): boolean {
  if (row.kind !== 'member') return false
  const { member } = row
  if (member.user.id === permissions.currentUserId) return false
  if (member.role === 'owner') return permissions.canManageAdmins
  return permissions.canManage
}
