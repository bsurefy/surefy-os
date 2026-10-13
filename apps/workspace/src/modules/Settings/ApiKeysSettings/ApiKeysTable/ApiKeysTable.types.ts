// SPDX-License-Identifier: AGPL-3.0-only
import type { ApiKeyDto } from '@surefy/contracts'

import type { ApiKeyDialogKind } from '../ApiKeysSettings.constants'
import type { ReactNode } from 'react'

export interface ApiKeysTableProps {
  rows: ApiKeyDto[]
  isLoading: boolean
  sort: string
  onSortChange: (sort: string) => void
  emptyState: ReactNode
  /** Admins and Owners may rename and revoke. */
  canManage: boolean
  onOpen: (apiKey: ApiKeyDto) => void
  onAction: (kind: ApiKeyDialogKind, apiKey: ApiKeyDto) => void
}
