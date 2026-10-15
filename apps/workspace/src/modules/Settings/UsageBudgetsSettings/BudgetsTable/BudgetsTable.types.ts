// SPDX-License-Identifier: AGPL-3.0-only
import type { BudgetDto } from '@surefy/contracts'

import type { ReactNode } from 'react'

export interface BudgetsTableProps {
  /** Team budgets name the team; personal limits the person and the team they are charged to. */
  scope: 'team' | 'user'
  rows: BudgetDto[]
  isLoading: boolean
  emptyState: ReactNode
  canManage: boolean
  onEdit: (budget: BudgetDto) => void
  onDelete: (budget: BudgetDto) => void
}
