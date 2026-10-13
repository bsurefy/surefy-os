// SPDX-License-Identifier: AGPL-3.0-only
'use client'

import { ListChecks, SearchX } from 'lucide-react'

import { APPROVAL_KINDS, APPROVAL_RISKS } from '@surefy/contracts'
import {
  DataTableSearch,
  DataTableToolbar,
  EmptyState,
  BulkActionBar,
} from '@surefy/ui/components/DataDisplay'
import { ErrorState } from '@surefy/ui/components/Feedback'
import { Combobox, Field } from '@surefy/ui/components/Forms'
import { PageHeader } from '@surefy/ui/components/Layout'
import { FilterChips, LoadMore } from '@surefy/ui/components/Navigation'
import { Button } from '@surefy/ui/primitives/button'

import InsightsTabs from '../InsightsTabs'
import { ANY, APPROVAL_VIEWS } from './Approvals.constants'
import { useApprovalsController } from './Approvals.controller'
import { useApprovalLabels } from './Approvals.hooks'
import ApprovalsTable from './ApprovalsTable'
import RejectDialog from './RejectDialog'

/**
 * Insights › Approvals: the queue of actions waiting for a person (oldest first) and what was
 * decided today. Bulk approve and reject are offered for items of one rule within the quick-approve
 * limit. Opening a row shows what will happen and the decision.
 */
export default function Approvals() {
  const c = useApprovalsController()
  const { t } = c
  const labels = useApprovalLabels()
  const isPendingView = c.filters.view === 'pending'

  const emptyState = c.hasFilters ? (
    <EmptyState
      icon={SearchX}
      title={t('noResults.title')}
      description={t('noResults.description')}
      actionLabel={t('noResults.clear')}
      onAction={c.onClearFilters}
    />
  ) : (
    <EmptyState
      icon={ListChecks}
      title={isPendingView ? t('empty.title') : t('decidedEmpty.title')}
      description={isPendingView ? t('empty.description') : t('decidedEmpty.description')}
    />
  )

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t('title')}
        description={t('description')}
        tabs={<InsightsTabs active="approvals" />}
      />
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
        <FilterChips
          label={t('views.label')}
          options={APPROVAL_VIEWS.map((view) => ({
            value: view,
            label: t(`views.${view}`),
            count: c.counts[view],
          }))}
          value={c.filters.view}
          onValueChange={(view) => {
            c.onFiltersChange({ view })
          }}
        />
      </div>
      <DataTableToolbar>
        <DataTableSearch
          label={t('search.label')}
          placeholder={t('search.placeholder')}
          value={c.filters.q}
          onValueChange={c.onSearchChange}
        />
        <Field label={t('filters.kind')} isLabelHidden className="w-56">
          <Combobox
            options={[
              { value: ANY, label: t('filters.anyKind') },
              ...APPROVAL_KINDS.map((kind) => ({ value: kind, label: labels.kind(kind) })),
            ]}
            labels={{
              placeholder: t('filters.anyKind'),
              search: t('filters.kind'),
              empty: t('noResults.title'),
            }}
            value={c.filters.kind ?? ANY}
            onValueChange={(value) => {
              c.onFiltersChange({
                kind: value === ANY ? null : (value as (typeof APPROVAL_KINDS)[number]),
              })
            }}
          />
        </Field>
        <Field label={t('filters.risk')} isLabelHidden className="w-44">
          <Combobox
            options={[
              { value: ANY, label: t('filters.anyRisk') },
              ...APPROVAL_RISKS.map((risk) => ({ value: risk, label: labels.risk(risk) })),
            ]}
            labels={{
              placeholder: t('filters.anyRisk'),
              search: t('filters.risk'),
              empty: t('noResults.title'),
            }}
            value={c.filters.risk ?? ANY}
            onValueChange={(value) => {
              c.onFiltersChange({
                risk: value === ANY ? null : (value as (typeof APPROVAL_RISKS)[number]),
              })
            }}
          />
        </Field>
      </DataTableToolbar>
      {isPendingView && c.selectedCount > 0 && (
        <div className="flex flex-col gap-2">
          <BulkActionBar
            labels={{
              selected: t('bulk.selected', { count: c.selectedCount }),
              clear: t('bulk.clear'),
            }}
            onClear={c.onClearSelection}
          >
            <Button size="sm" disabled={!c.bulk.isAllowed} onClick={c.onBulkApprove}>
              {t('bulk.approve', { count: c.selectedCount })}
            </Button>
            <Button
              size="sm"
              variant="secondary"
              disabled={!c.bulk.isAllowed}
              onClick={() => {
                c.onRejectOpenChange(true)
              }}
            >
              {t('bulk.reject', { count: c.selectedCount })}
            </Button>
          </BulkActionBar>
          {!c.bulk.isAllowed && (
            <p role="status" className="text-caption text-muted-foreground">
              {t('bulk.blocked', { count: c.bulk.blockedCount })}
            </p>
          )}
        </div>
      )}
      <section aria-busy={c.isLoading || undefined}>
        {c.errorMessage ? (
          <ErrorState
            title={t('loadError')}
            message={c.errorMessage}
            reference={c.errorReference}
            onRetry={c.refetch}
          />
        ) : (
          <>
            <ApprovalsTable
              rows={c.rows}
              orgSlug={c.orgSlug}
              view={c.filters.view}
              isLoading={c.isLoading}
              emptyState={emptyState}
              selection={c.selection}
              onSelectionChange={c.onSelectionChange}
            />
            <LoadMore
              label={t('loadMore')}
              onLoadMore={c.onLoadMore}
              isLoading={c.isLoadingMore}
              hasMore={c.hasMore}
            />
          </>
        )}
      </section>
      <RejectDialog
        open={c.isRejecting}
        onOpenChange={c.onRejectOpenChange}
        title={t('bulk.rejectTitle', { count: c.bulk.ids.length })}
        description={t('bulk.rejectDescription', { count: c.bulk.ids.length })}
        onConfirm={c.onBulkReject}
        error={c.rejectError}
      />
    </div>
  )
}
