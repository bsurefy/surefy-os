// SPDX-License-Identifier: AGPL-3.0-only
'use client'

import { Activity, SearchX } from 'lucide-react'

import { AGENT_RUN_STATUSES } from '@surefy/contracts'
import { DataTableSearch, DataTableToolbar, EmptyState } from '@surefy/ui/components/DataDisplay'
import { ErrorState } from '@surefy/ui/components/Feedback'
import { SwitchField } from '@surefy/ui/components/Forms'
import { Section } from '@surefy/ui/components/Layout'
import { FilterChips, LoadMore } from '@surefy/ui/components/Navigation'

import { ANY_STATUS, STATUS_FILTERS } from './RunsTab.constants'
import { useRunsTabController } from './RunsTab.controller'
import RunsTable from './RunsTable'

import type { RunsTabProps } from './RunsTab.types'

/** Runs: this agent's runs with filters; each one opens its detail in Insights. */
export default function RunsTab(props: Readonly<RunsTabProps>) {
  const c = useRunsTabController(props)
  const { t } = c

  const emptyState = c.hasFilters ? (
    <EmptyState
      icon={SearchX}
      headingLevel={3}
      title={t('noResults.title')}
      description={t('noResults.description')}
      actionLabel={t('noResults.clear')}
      onAction={c.onClearFilters}
    />
  ) : (
    <EmptyState
      icon={Activity}
      headingLevel={3}
      title={t('empty.title')}
      description={t('empty.description')}
    />
  )

  return (
    <Section title={t('title')} description={t('description')}>
      <div className="flex flex-col gap-4">
        <DataTableToolbar>
          <DataTableSearch
            label={t('search.label')}
            placeholder={t('search.placeholder')}
            value={c.filters.q}
            onValueChange={c.onSearchChange}
          />
          <SwitchField
            size="sm"
            label={t('filters.needsPerson')}
            checked={c.filters.human}
            onCheckedChange={(human) => {
              c.onFiltersChange({ human })
            }}
          />
          <SwitchField
            size="sm"
            label={t('filters.testRuns')}
            checked={c.filters.test}
            onCheckedChange={(test) => {
              c.onFiltersChange({ test })
            }}
          />
        </DataTableToolbar>
        <FilterChips
          label={t('filters.status')}
          options={[
            { value: ANY_STATUS, label: t('filters.anyStatus') },
            ...STATUS_FILTERS.map((status) => ({ value: status, label: t(`statuses.${status}`) })),
          ]}
          value={c.filters.status ?? ANY_STATUS}
          onValueChange={(value) => {
            const status = AGENT_RUN_STATUSES.find((candidate) => candidate === value)
            c.onFiltersChange({
              status: STATUS_FILTERS.find((candidate) => candidate === status) ?? null,
            })
          }}
        />
        <div aria-busy={c.isLoading || undefined}>
          {c.errorMessage ? (
            <ErrorState
              title={t('loadError')}
              message={c.errorMessage}
              reference={c.errorReference}
              onRetry={c.refetch}
            />
          ) : (
            <>
              <RunsTable
                rows={c.rows}
                isLoading={c.isLoading}
                emptyState={emptyState}
                getRunHref={c.getRunHref}
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
      </div>
    </Section>
  )
}
