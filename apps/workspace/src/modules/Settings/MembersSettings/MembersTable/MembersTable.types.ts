// SPDX-License-Identifier: AGPL-3.0-only
import type { DataTableSelection } from '@surefy/ui/components/DataDisplay'

import type { MemberDialogKind } from '../MembersSettings.constants'
import type { MemberRow } from '../MembersSettings.types'
import type { ReactNode } from 'react'

export interface MembersTableProps {
  rows: MemberRow[]
  isLoading: boolean
  sort: string
  onSortChange: (sort: string) => void
  selection: DataTableSelection
  onSelectionChange: (selection: DataTableSelection) => void
  emptyState: ReactNode
  /** Who may change what: Owners are changed only by Owners, and nobody changes their own row. */
  canManage: boolean
  canManageAdmins: boolean
  currentUserId: string | undefined
  onAction: (kind: MemberDialogKind, row: MemberRow) => void
  onResend: (invitationId: string) => void
  onCopyLink: (invitationId: string) => void
  onReactivate: (memberId: string) => void
}
