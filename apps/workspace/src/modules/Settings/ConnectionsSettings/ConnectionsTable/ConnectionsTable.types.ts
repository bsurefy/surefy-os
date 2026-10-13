// SPDX-License-Identifier: AGPL-3.0-only
import type { ConnectionDto } from '@surefy/contracts'

import type { ConnectionDialogKind } from '../ConnectionsSettings.constants'
import type { ReactNode } from 'react'

export interface ConnectionsTableProps {
  rows: ConnectionDto[]
  isLoading: boolean
  sort: string
  onSortChange: (sort: string) => void
  emptyState: ReactNode
  /** Admins and Owners see every connection and who connected it; Builders only their own. */
  canManage: boolean
  userId: string | undefined
  /** Reconnect and Disconnect need the network. */
  isOnline: boolean
  providerName: (providerKey: string) => string
  testingId: string | undefined
  onAction: (kind: ConnectionDialogKind, connection: ConnectionDto) => void
  onTest: (connection: ConnectionDto) => void
}
