// SPDX-License-Identifier: AGPL-3.0-only
'use client'

import { Plus, SearchX, UserRound, UsersRound } from 'lucide-react'

import type { BudgetDto } from '@surefy/contracts'
import { DataTableSearch, DataTableToolbar, EmptyState } from '@surefy/ui/components/DataDisplay'
import { ErrorState } from '@surefy/ui/components/Feedback'
import { Section } from '@surefy/ui/components/Layout'
import { LoadMore } from '@surefy/ui/components/Navigation'
import { Button } from '@surefy/ui/primitives/button'

import BudgetsTable from '../BudgetsTable'
import { useBudgetListController } from './BudgetList.controller'

import type { ReactNode } from 'react'

/** The team budgets or the personal limits, with Add for those who can change budgets. */
export default function BudgetList({
  orgId,
  scope,
  canManage,
  note,
  onCreate,
  onEdit,
  onDelete,
}: Readonly<{
  orgId: string
  scope: 'team' | 'user'
  canManage: boolean
  /** Shown above the table: the charging note next to the team budgets. */
  note?: ReactNode
  onCreate: () => void
  onEdit: (budget: BudgetDto) => void
  onDelete: (budget: BudgetDto) => void
}>) {
  const c = useBudgetListController({ orgId, scope })
  const { t } = c
  const key = scope === 'team' ? 'teams' : 'people'

  const emptyState = c.q ? (
    <EmptyState
      icon={SearchX}
      title={t('people.noResults.title')}
      description={t('people.noResults.description')}
      actionLabel={t('people.noResults.clear')}
      onAction={c.onClearSearch}
    />
  ) : (
    <EmptyState
      icon={scope === 'team' ? UsersRound : UserRound}
      title={t(`${key}.empty.title`)}
      description={t(`${key}.empty.description`)}
      actionLabel={canManage ? t(`${key}.add`) : undefined}
      onAction={canManage ? onCreate : undefined}
    />
  )

  return (
    <Section
      title={t(`${key}.title`)}
      description={t(`${key}.description`)}
      actions={
        canManage ? (
          <Button variant="secondary" icon={Plus} onClick={onCreate}>
            {t(`${key}.add`)}
          </Button>
        ) : undefined
      }
    >
      <div className="flex flex-col gap-4" aria-busy={c.isLoading || undefined}>
        {note}
        {scope === 'user' && (
          <DataTableToolbar>
            <DataTableSearch
              label={t('people.search.label')}
              placeholder={t('people.search.placeholder')}
              value={c.q}
              onValueChange={c.onSearchChange}
            />
          </DataTableToolbar>
        )}
        {c.errorMessage ? (
          <ErrorState
            title={t(`${key}.loadError`)}
            message={c.errorMessage}
            reference={c.errorReference}
            onRetry={c.refetch}
            size="sm"
          />
        ) : (
          <>
            <BudgetsTable
              scope={scope}
              rows={c.rows}
              isLoading={c.isLoading}
              emptyState={emptyState}
              canManage={canManage}
              onEdit={onEdit}
              onDelete={onDelete}
            />
            <LoadMore
              label={t('loadMore')}
              onLoadMore={c.onLoadMore}
              isLoading={c.isLoadingMore}
              hasMore={c.hasMore}
            />
          </>
        )}
      </div>
    </Section>
  )
}
