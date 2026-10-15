// SPDX-License-Identifier: AGPL-3.0-only
'use client'

import { ArrowRight } from 'lucide-react'
import Link from 'next/link'
import { useFormatter, useTranslations } from 'next-intl'

import type { InsightsRunsInterval, InsightsRunsTimeseriesDto } from '@surefy/contracts'
import { BarChart, ChartFrame, ChartTable, EmptyState } from '@surefy/ui/components/DataDisplay'
import { ErrorState } from '@surefy/ui/components/Feedback'
import { Button } from '@surefy/ui/primitives/button'

import { CHART_HEIGHT } from '../InsightsOverview.constants'
import { toRunsData } from '../InsightsOverview.utils'

import type { Route } from 'next'

interface RunsOverTimeProps {
  interval: InsightsRunsInterval
  data: InsightsRunsTimeseriesDto | undefined
  isLoading: boolean
  error: { message: string; reference?: string } | null
  onRetry: () => void
  /** The Runs tab for the same range and agent (drill-down). */
  runsHref: Route
}

const DATE_FORMAT = {
  day: { month: 'short', day: 'numeric' },
  week: { month: 'short', day: 'numeric' },
  month: { month: 'short', year: 'numeric' },
} as const satisfies Record<InsightsRunsInterval, object>

/** Finished runs per day or week: succeeded, needed a person and failed, as bars or a table. */
export default function RunsOverTime({
  interval,
  data,
  isLoading,
  error,
  onRetry,
  runsHref,
}: Readonly<RunsOverTimeProps>) {
  const t = useTranslations('insights.overview.runsChart')
  const tChart = useTranslations('insights.overview.chart')
  const format = useFormatter()
  const rows = data ? toRunsData(data) : []
  const series = [
    { key: 'succeeded', label: t('succeeded'), color: 'success' },
    { key: 'neededHuman', label: t('neededHuman'), color: 'warning' },
    { key: 'failed', label: t('failed'), color: 'destructive' },
  ]
  const formatX = (value: string | number) =>
    format.dateTime(new Date(value), DATE_FORMAT[data?.interval ?? interval])
  const isEmpty =
    data?.points.every((point) => point.succeeded + point.failed + point.canceled === 0) === true

  let state: 'ready' | 'loading' | 'empty' | 'error' = 'ready'
  if (isLoading) state = 'loading'
  else if (error) state = 'error'
  else if (isEmpty) state = 'empty'

  return (
    <ChartFrame
      title={t('title')}
      description={t('description')}
      labels={{ chart: tChart('chart'), table: tChart('table'), view: tChart('view') }}
      state={state}
      height={CHART_HEIGHT}
      actions={
        <Button variant="ghost" size="sm" asChild>
          <Link href={runsHref}>
            {t('seeRuns')}
            <ArrowRight aria-hidden />
          </Link>
        </Button>
      }
      stateContent={
        state === 'error' ? (
          <ErrorState
            title={tChart('error')}
            message={error?.message ?? ''}
            reference={error?.reference}
            onRetry={onRetry}
          />
        ) : (
          <EmptyState size="sm" title={t('empty')} headingLevel={3} />
        )
      }
      table={
        <ChartTable
          data={rows}
          xKey="start"
          xLabel={t('period')}
          series={series}
          formatX={formatX}
          formatValue={(value) => format.number(value)}
          caption={t('label', { interval })}
        />
      }
    >
      <BarChart
        data={rows}
        xKey="start"
        series={series}
        height={CHART_HEIGHT}
        formatX={formatX}
        formatValue={(value) => format.number(value)}
        label={t('label', { interval })}
      />
    </ChartFrame>
  )
}
