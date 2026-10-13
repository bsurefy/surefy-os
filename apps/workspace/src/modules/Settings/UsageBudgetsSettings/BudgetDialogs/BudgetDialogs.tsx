// SPDX-License-Identifier: AGPL-3.0-only
'use client'

import type { BudgetDto } from '@surefy/contracts'

import BudgetFormDialog from './BudgetFormDialog'
import DeleteBudgetDialog from './DeleteBudgetDialog'
import { BUDGET_DIALOG } from '../UsageBudgetsSettings.constants'

import type { OpenBudgetDialog } from '../UsageBudgetsSettings.types'

/** The open budget dialog, if any. */
export default function BudgetDialogs({
  orgId,
  dialog,
  organizationBudget,
  currency,
  onClose,
}: Readonly<{
  orgId: string
  dialog: OpenBudgetDialog | null
  organizationBudget: BudgetDto | null
  currency: string | null
  onClose: () => void
}>) {
  if (!dialog) return null
  if (dialog.kind === BUDGET_DIALOG.DELETE) {
    return <DeleteBudgetDialog orgId={orgId} budget={dialog.budget} onClose={onClose} />
  }
  const budget = dialog.kind === BUDGET_DIALOG.EDIT ? dialog.budget : null
  return (
    <BudgetFormDialog
      orgId={orgId}
      scope={dialog.kind === BUDGET_DIALOG.CREATE ? dialog.scope : dialog.budget.scope}
      budget={budget}
      organizationBudget={organizationBudget}
      currency={currency}
      onClose={onClose}
    />
  )
}
