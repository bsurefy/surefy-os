// SPDX-License-Identifier: AGPL-3.0-only
'use client'

import { ChartLine, Download } from 'lucide-react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { useFormatter } from 'next-intl'

import { ROUTES } from '@/constants/routes'
import { DataTableToolbar, EmptyState } from '@surefy/ui/components/DataDisplay'
import { Banner } from '@surefy/ui/components/Feedback'
import { Combobox, Field } from '@surefy/ui/components/Forms'
import { PageHeader } from '@surefy/ui/components/Layout'
import { Button } from '@surefy/ui/primitives/button'

import InsightsTabs from '../InsightsTabs'
import BudgetMeterCard from './BudgetMeterCard'
import CostBreakdown from './CostBreakdown'
import InsightsExportDialog from './InsightsExportDialog'
import { ANY, type BreakdownDimension } from './InsightsOverview.constants'
import { useInsightsOverviewController } from './InsightsOverview.controller'
import KpiCards from './KpiCards'
import RangePicker from './RangePicker'
import RunKpis from './RunKpis'
import RunsOverTime from './RunsOverTime'
import TokensOverTime from './TokensOverTime'

/**
 * Insights › Overview (design/workspace/insights.md): usage, cost and runs for a date range,
 * filtered by team, person, agent and model; the usage and run KPIs, the budget meter, cost by
 * team, person, model or agent, tokens and runs over time, and the CSV export. Private chats count
 * in the numbers only.
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
    [t('filters.agent'), optionLabel(c.agentOptions, filters.agent)],
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
    key: BreakdownDimension,
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
        tabs={<InsightsTabs active="overview" />}
        actions={
          <>
            <RangePicker
              range={filters.range}
              first={c.rangeDays.first}
              last={c.rangeDays.last}
              timeZone={c.timeZone}
              onRangeChange={c.onFiltersChange}
            />
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
          </>
        }
      />
      <DataTableToolbar>
        {filterSelect('team', c.teamOptions, 'w-44')}
        {filterSelect('person', c.personOptions, 'w-44')}
        {filterSelect('agent', c.agentOptions, 'w-48')}
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
          secondaryAction={
            c.newAgentHref && (
              <Button variant="secondary" asChild>
                <Link href={c.newAgentHref}>{t('empty.createAgent')}</Link>
              </Button>
            )
          }
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
          <BudgetMeterCard
            data={c.budget.data}
            isLoading={c.budget.isLoading}
            error={c.budget.error}
            onRetry={c.budget.refetch}
            scope={c.budgetScope}
            budgetsHref={c.budgetsHref}
          />
          <RunKpis
            data={c.runs.data}
            isLoading={c.runs.isLoading}
            error={c.runs.error}
            onRetry={c.runs.refetch}
            hasUsageOnlyFilters={c.hasUsageOnlyFilters}
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
                c.onFiltersChange({ [by]: key })
              }}
            />
            <TokensOverTime
              interval={c.interval}
              data={c.series.data}
              isLoading={c.series.isLoading}
              error={c.series.error}
              onRetry={c.series.refetch}
            />
            <RunsOverTime
              interval={c.runsInterval}
              data={c.runsSeries.data}
              isLoading={c.runsSeries.isLoading}
              error={c.runsSeries.error}
              onRetry={c.runsSeries.refetch}
              runsHref={c.runsHref}
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
