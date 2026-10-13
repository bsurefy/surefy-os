// SPDX-License-Identifier: AGPL-3.0-only
'use client'

import { Pencil, Plus, Trash2 } from 'lucide-react'
import { useTranslations } from 'next-intl'

import type { BudgetDto } from '@surefy/contracts'
import { ErrorState, SkeletonCard } from '@surefy/ui/components/Feedback'
import { Section } from '@surefy/ui/components/Layout'
import { Button } from '@surefy/ui/primitives/button'

import OrganizationBudgetDetails from './OrganizationBudgetDetails'

/**
 * The organization budget: every call counts against it, including calls without a person (API
 * keys, the widget, Slack, WhatsApp). Team budgets and personal limits never exceed it.
 */
export default function OrganizationBudget({
  budget,
  isLoading,
  errorMessage,
  errorReference,
  onRetry,
  canManage,
  onCreate,
  onEdit,
  onDelete,
}: Readonly<{
  budget: BudgetDto | null
  isLoading: boolean
  errorMessage: string | null
  errorReference?: string
  onRetry: () => void
  canManage: boolean
  onCreate: () => void
  onEdit: (budget: BudgetDto) => void
  onDelete: (budget: BudgetDto) => void
}>) {
  const t = useTranslations('settings.usage')

  let body
  if (isLoading) body = <SkeletonCard lines={3} />
  else if (errorMessage) {
    body = (
      <ErrorState
        title={t('organization.loadError')}
        message={errorMessage}
        reference={errorReference}
        onRetry={onRetry}
        size="sm"
      />
    )
  } else if (!budget) {
    body = (
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-body text-muted-foreground">{t('organization.empty')}</p>
        {canManage && (
          <Button icon={Plus} onClick={onCreate}>
            {t('organization.set')}
          </Button>
        )}
      </div>
    )
  } else body = <OrganizationBudgetDetails budget={budget} />

  return (
    <Section
      title={t('organization.title')}
      description={t('organization.description')}
      actions={
        canManage && budget ? (
          <div className="flex gap-2">
            <Button
              variant="secondary"
              icon={Pencil}
              onClick={() => {
                onEdit(budget)
              }}
            >
              {t('actions.edit')}
            </Button>
            <Button
              variant="ghost"
              size="icon-md"
              aria-label={t('organization.delete')}
              onClick={() => {
                onDelete(budget)
              }}
            >
              <Trash2 aria-hidden />
            </Button>
          </div>
        ) : undefined
      }
    >
      <div aria-busy={isLoading || undefined}>{body}</div>
    </Section>
  )
}
