// SPDX-License-Identifier: AGPL-3.0-only
'use client'

import { ChartLine, Download } from 'lucide-react'
import { useParams, useRouter } from 'next/navigation'
import { useFormatter } from 'next-intl'

import { ROUTES } from '@/constants/routes'
import type { InsightsBreakdownDimension } from '@surefy/contracts'
import { DataTableToolbar, EmptyState } from '@surefy/ui/components/DataDisplay'
import { Banner } from '@surefy/ui/components/Feedback'
import { Combobox, Field } from '@surefy/ui/components/Forms'
import { PageHeader } from '@surefy/ui/components/Layout'
import { Button } from '@surefy/ui/primitives/button'

import CostBreakdown from './CostBreakdown'
import InsightsExportDialog from './InsightsExportDialog'
import { ANY } from './InsightsOverview.constants'
import { useInsightsOverviewController } from './InsightsOverview.controller'
import KpiCards from './KpiCards'
import RangePicker from './RangePicker'
import TokensOverTime from './TokensOverTime'

const FILTER_OF: Record<InsightsBreakdownDimension, 'team' | 'person' | 'model'> = {
  team: 'team',
  person: 'person',
  model: 'model',
}

/**
 * Insights › Overview (design/workspace/insights.md): usage and cost for a date range, filtered by
 * team, person and model; the MVP KPIs, cost by team, person or model, tokens over time, and the
 * CSV export. Private chats count in the numbers only.
 */
export default function InsightsOverview() {
  const c = useInsightsOverviewController()
  const { t, filters } = c
  const format = useFormatter()
  const router = useRouter()
  const { orgSlug } = useParams<{ orgSlug: string }>()

  const optionLabel = (options: { value: string; label: string }[], value: string | null) =>
    value === null ? null : (options.find((option) => option.value === value)?.label ?? value)
  const filterLabels = [
    [t('filters.team'), optionLabel(c.teamOptions, filters.team)],
    [t('filters.person'), optionLabel(c.personOptions, filters.person)],
    [t('filters.model'), optionLabel(c.modelOptions, filters.model)],
  ]
    .filter((entry): entry is [string, string] => entry[1] !== null)
    .map(([name, value]) => `${name}: ${value}`)
  const dayLabel = (day: string) =>
    format.dateTime(new Date(`${day}T12:00:00Z`), { dateStyle: 'medium', timeZone: 'UTC' })
  const rangeLabel =
    filters.range === 'custom'
      ? t('filters.customRangeValue', {
          from: dayLabel(c.rangeDays.first),
          to: dayLabel(c.rangeDays.last),
        })
      : t(`filters.ranges.${filters.range}`)

  const filterSelect = (
    key: 'team' | 'person' | 'model',
    options: { value: string; label: string }[],
    className: string,
  ) => (
    <Field label={t(`filters.${key}`)} isLabelHidden className={className}>
      <Combobox
        options={[
          { value: ANY, label: t(`filters.any${key[0]?.toUpperCase()}${key.slice(1)}`) },
          ...options,
        ]}
        labels={{
          placeholder: t(`filters.any${key[0]?.toUpperCase()}${key.slice(1)}`),
          search: t(`filters.${key}Search`),
          empty: t(`filters.${key}Empty`),
        }}
        value={filters[key] ?? ANY}
        onValueChange={(value) => {
          c.onFiltersChange({ [key]: value === ANY ? null : value })
        }}
      />
    </Field>
  )

  const overview = c.overview.data
  const isEmpty = overview?.hasUsage === false && !c.hasFilters

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t('title')}
        description={t('description')}
        actions={
          <Button
            variant="secondary"
            icon={Download}
            disabled={isEmpty}
            onClick={() => {
              c.onExportOpenChange(true)
            }}
          >
            {t('export.open')}
          </Button>
        }
      />
      <DataTableToolbar>
        <RangePicker
          range={filters.range}
          first={c.rangeDays.first}
          last={c.rangeDays.last}
          timeZone={c.timeZone}
          onRangeChange={c.onFiltersChange}
        />
        {filterSelect('team', c.teamOptions, 'w-44')}
        {filterSelect('person', c.personOptions, 'w-44')}
        {filterSelect('model', c.modelOptions, 'w-52')}
        {c.hasFilters && (
          <Button variant="ghost" onClick={c.onClearFilters}>
            {t('filters.clear')}
          </Button>
        )}
      </DataTableToolbar>

      {isEmpty ? (
        <EmptyState
          icon={ChartLine}
          title={t('empty.title')}
          description={t('empty.description')}
          actionLabel={t('empty.action')}
          onAction={() => {
            router.push(ROUTES.workspace.chat(orgSlug))
          }}
        />
      ) : (
        <>
          {overview && overview.unpricedModels.length > 0 && (
            <Banner
              tone="warning"
              title={t('unpriced.title')}
              description={t('unpriced.description', {
                count: overview.unpricedModels.length,
                models: overview.unpricedModels.map((model) => model.displayName).join(', '),
              })}
            />
          )}
          <KpiCards
            data={overview}
            isLoading={c.overview.isLoading}
            error={c.overview.error}
            onRetry={c.overview.refetch}
          />
          {overview?.dataThrough && (
            <p className="text-caption text-muted-foreground">
              {t('dataThrough', {
                time: format.dateTime(new Date(overview.dataThrough), {
                  dateStyle: 'medium',
                  timeStyle: 'short',
                }),
              })}
            </p>
          )}
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            <CostBreakdown
              by={filters.by}
              data={c.breakdown.data}
              isLoading={c.breakdown.isLoading}
              error={c.breakdown.error}
              onRetry={c.breakdown.refetch}
              onByChange={(by) => {
                c.onFiltersChange({ by })
              }}
              onFilterGroup={(by, key) => {
                c.onFiltersChange({ [FILTER_OF[by]]: key })
              }}
            />
            <TokensOverTime
              interval={c.interval}
              data={c.series.data}
              isLoading={c.series.isLoading}
              error={c.series.error}
              onRetry={c.series.refetch}
            />
          </div>
        </>
      )}

      {c.isExportOpen && (
        <InsightsExportDialog
          orgId={c.orgId}
          query={c.query}
          rangeLabel={rangeLabel}
          filterLabels={filterLabels}
          onClose={() => {
            c.onExportOpenChange(false)
          }}
        />
      )}
    </div>
  )
}
