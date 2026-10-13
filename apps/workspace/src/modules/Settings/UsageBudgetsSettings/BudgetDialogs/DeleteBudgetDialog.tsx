// SPDX-License-Identifier: AGPL-3.0-only
'use client'

import { useTranslations } from 'next-intl'

import { useDeleteBudgetMutation } from '@/api/usage'
import type { BudgetDto } from '@surefy/contracts'
import { toast } from '@surefy/ui/components/Feedback'
import { ConfirmDialog } from '@surefy/ui/components/Overlay'
import { getErrorMessage } from '@surefy/web-core/errors'

/**
 * Delete a budget (T2: it stops limiting other people's usage). The other budgets that apply to
 * the same calls stay; this month's spend stays in Insights.
 */
export default function DeleteBudgetDialog({
  orgId,
  budget,
  onClose,
}: Readonly<{ orgId: string; budget: BudgetDto; onClose: () => void }>) {
  const t = useTranslations('settings.usage')
  const tErrors = useTranslations('errors')
  const remove = useDeleteBudgetMutation(orgId, { silent: true })
  const name = budget.team?.name ?? budget.user?.name ?? t('formerTarget')

  return (
    <ConfirmDialog
      open
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
      tier="T2"
      tone="destructive"
      title={t('delete.title', { scope: budget.scope, name })}
      description={t(`delete.description.${budget.scope}`, { name })}
      labels={{ confirm: t('delete.confirm', { scope: budget.scope }) }}
      error={remove.error ? getErrorMessage(remove.error, tErrors) : undefined}
      onConfirm={async () => {
        await remove.mutateAsync(budget.id)
        toast.success(t('delete.deleted', { scope: budget.scope, name }))
      }}
    />
  )
}
