// SPDX-License-Identifier: AGPL-3.0-only
'use client'

import { Activity, SearchX } from 'lucide-react'
import Link from 'next/link'
import { useFormatter } from 'next-intl'

import { DataTableSearch, DataTableToolbar, EmptyState } from '@surefy/ui/components/DataDisplay'
import { ErrorState } from '@surefy/ui/components/Feedback'
import { Combobox, Field, SelectInput, SwitchField } from '@surefy/ui/components/Forms'
import { PageHeader } from '@surefy/ui/components/Layout'
import { LoadMore } from '@surefy/ui/components/Navigation'
import { Button } from '@surefy/ui/primitives/button'

import InsightsTabs from '../InsightsTabs'
import { ANY, RUNS_RANGES, STATUS_FILTERS, TRIGGER_FILTERS } from './Runs.constants'
import { useRunsController } from './Runs.controller'
import RunsTable from './RunsTable'

import type { FilterOption, RunsFilters } from './Runs.types'

type ListFilter = 'agent' | 'team' | 'model'

/**
 * Insights › Runs (design/workspace/insights.md): every run of the agents the person may read,
 * with search by run, agent or person, filters for status, trigger, agent, team, model and date,
 * and sort by start, duration or cost. A row opens the run detail.
 */
export default function Runs() {
  const c = useRunsController()
  const { t, filters } = c
  const format = useFormatter()

  const dayLabel = (day: string) =>
    format.dateTime(new Date(`${day}T12:00:00Z`), { dateStyle: 'medium', timeZone: 'UTC' })
  const rangeOptions = RUNS_RANGES.filter(
    (range) => range !== 'custom' || (filters.range === 'custom' && filters.from),
  ).map((range) => ({
    value: range,
    label:
      range === 'custom' && filters.from
        ? t('filters.customRange', {
            from: dayLabel(filters.from),
            to: dayLabel(filters.to ?? filters.from),
          })
        : t(`filters.ranges.${range}`),
  }))

  const listFilter = (key: ListFilter, options: FilterOption[], className: string) => (
    <Field label={t(`filters.${key}`)} isLabelHidden className={className}>
      <Combobox
        options={[{ value: ANY, label: t(`filters.any.${key}`) }, ...options]}
        labels={{
          placeholder: t(`filters.any.${key}`),
          search: t(`filters.search.${key}`),
          empty: t(`filters.empty.${key}`),
        }}
        value={filters[key] ?? ANY}
        onValueChange={(value) => {
          c.onFiltersChange({ [key]: value === ANY ? null : value })
        }}
      />
    </Field>
  )

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
      icon={Activity}
      title={t('empty.title')}
      description={t('empty.description')}
      secondaryAction={
        c.newAgentHref && (
          <Button variant="secondary" asChild>
            <Link href={c.newAgentHref}>{t('empty.createAgent')}</Link>
          </Button>
        )
      }
    />
  )

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t('title')}
        description={t('description')}
        tabs={<InsightsTabs active="runs" />}
      />
      <DataTableToolbar>
        <DataTableSearch
          label={t('search.label')}
          placeholder={t('search.placeholder')}
          value={filters.q}
          onValueChange={c.onSearchChange}
        />
        <Field label={t('filters.status')} isLabelHidden className="w-40">
          <SelectInput
            options={[
              { value: ANY, label: t('filters.any.status') },
              ...STATUS_FILTERS.map((status) => ({
                value: status,
                label: t(`statuses.${status}`),
              })),
            ]}
            value={filters.status ?? ANY}
            onValueChange={(value) => {
              c.onFiltersChange({
                status: STATUS_FILTERS.find((status) => status === value) ?? null,
              })
            }}
          />
        </Field>
        <Field label={t('filters.trigger')} isLabelHidden className="w-40">
          <SelectInput
            options={[
              { value: ANY, label: t('filters.any.trigger') },
              ...TRIGGER_FILTERS.map((trigger) => ({
                value: trigger,
                label: t(`triggers.${trigger}`),
              })),
            ]}
            value={filters.trigger ?? ANY}
            onValueChange={(value) => {
              c.onFiltersChange({
                trigger: TRIGGER_FILTERS.find((trigger) => trigger === value) ?? null,
              })
            }}
          />
        </Field>
        {listFilter('agent', c.agentOptions, 'w-44')}
        {listFilter('team', c.teamOptions, 'w-40')}
        {listFilter('model', c.modelOptions, 'w-44')}
        <Field label={t('filters.range')} isLabelHidden className="w-44">
          <SelectInput
            options={rangeOptions}
            value={filters.range}
            onValueChange={(value) => {
              const range = RUNS_RANGES.find((candidate) => candidate === value) ?? 'any'
              const next: Partial<RunsFilters> = { range }
              if (range !== 'custom') Object.assign(next, { from: null, to: null })
              c.onFiltersChange(next)
            }}
          />
        </Field>
        <SwitchField
          size="sm"
          label={t('filters.neededHuman')}
          checked={filters.human}
          onCheckedChange={(human) => {
            c.onFiltersChange({ human })
          }}
        />
        {c.hasFilters && (
          <Button variant="ghost" onClick={c.onClearFilters}>
            {t('filters.clear')}
          </Button>
        )}
      </DataTableToolbar>
      <div aria-busy={c.isLoading || undefined} className="flex flex-col gap-4">
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
              sort={c.sort}
              onSortChange={c.onSortChange}
              thresholds={c.thresholds}
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
        <p className="text-caption text-muted-foreground">
          {t('timeZone', { timeZone: c.timeZone })}
        </p>
      </div>
    </div>
  )
}
