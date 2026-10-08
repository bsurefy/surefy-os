// SPDX-License-Identifier: AGPL-3.0-only
import type { GuardRuleRowDto } from '@surefy/contracts'

import type { ReactNode } from 'react'

export interface GuardrailsTableProps {
  rows: GuardRuleRowDto[]
  isLoading: boolean
  sort: { id: string; desc: boolean }
  onSortChange: (sort: { id: string; desc: boolean }) => void
  emptyState: ReactNode
  /** Whether the person may switch a given row on or off. */
  canToggle: (row: GuardRuleRowDto) => boolean
  onOpen: (row: GuardRuleRowDto) => void
  onToggle: (row: GuardRuleRowDto, isEnabled: boolean) => void
}
