// SPDX-License-Identifier: AGPL-3.0-only
'use client'

import type { BudgetDto } from '@surefy/contracts'
import { Banner } from '@surefy/ui/components/Feedback'
import { PageHeader } from '@surefy/ui/components/Layout'

import BudgetDialogs from './BudgetDialogs'
import BudgetList from './BudgetList'
import ChargingNote from './ChargingNote'
import OrganizationBudget from './OrganizationBudget'
import { BUDGET_DIALOG } from './UsageBudgetsSettings.constants'
import { useUsageBudgetsSettingsController } from './UsageBudgetsSettings.controller'

/**
 * Settings › Usage & budgets, the single home of AI cost budgets: the organization budget, team
 * budgets (charged by primary team) and personal limits, what happens when one is reached and the
 * alerts at 50, 80 and 100 percent.
 */
export default function UsageBudgetsSettings() {
  const c = useUsageBudgetsSettingsController()
  const { t } = c

  const onEdit = (budget: BudgetDto) => {
    c.openDialog({ kind: BUDGET_DIALOG.EDIT, budget })
  }
  const onDelete = (budget: BudgetDto) => {
    c.openDialog({ kind: BUDGET_DIALOG.DELETE, budget })
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t('title')} description={t('description')} />
      {!c.canManage && (
        <Banner tone="info" title={t('viewOnly.title')} description={t('viewOnly.description')} />
      )}
      <OrganizationBudget
        budget={c.organizationBudget}
        isLoading={c.isLoading}
        errorMessage={c.errorMessage}
        errorReference={c.errorReference}
        onRetry={c.refetch}
        canManage={c.canManage}
        onCreate={() => {
          c.openDialog({ kind: BUDGET_DIALOG.CREATE, scope: 'organization' })
        }}
        onEdit={onEdit}
        onDelete={onDelete}
      />
      <BudgetList
        orgId={c.orgId}
        scope="team"
        canManage={c.canManage}
        note={<ChargingNote orgId={c.orgId} orgSlug={c.orgSlug} />}
        onCreate={() => {
          c.openDialog({ kind: BUDGET_DIALOG.CREATE, scope: 'team' })
        }}
        onEdit={onEdit}
        onDelete={onDelete}
      />
      <BudgetList
        orgId={c.orgId}
        scope="user"
        canManage={c.canManage}
        onCreate={() => {
          c.openDialog({ kind: BUDGET_DIALOG.CREATE, scope: 'user' })
        }}
        onEdit={onEdit}
        onDelete={onDelete}
      />
      <BudgetDialogs
        orgId={c.orgId}
        dialog={c.dialog}
        organizationBudget={c.organizationBudget}
        currency={c.currency}
        onClose={c.closeDialog}
      />
    </div>
  )
}
