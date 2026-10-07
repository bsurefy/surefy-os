// SPDX-License-Identifier: AGPL-3.0-only
'use client'

import { useFormatter, useTranslations } from 'next-intl'

import type { InsightsInterval, InsightsTimeseriesDto } from '@surefy/contracts'
import { ChartFrame, ChartTable, EmptyState, LineChart } from '@surefy/ui/components/DataDisplay'
import { ErrorState } from '@surefy/ui/components/Feedback'

import { CHART_HEIGHT } from '../InsightsOverview.constants'
import { toTokenData } from '../InsightsOverview.utils'

interface TokensOverTimeProps {
  interval: InsightsInterval
  data: InsightsTimeseriesDto | undefined
  isLoading: boolean
  error: { message: string; reference?: string } | null
  onRetry: () => void
}

const DATE_FORMAT = {
  hour: { hour: 'numeric' },
  day: { month: 'short', day: 'numeric' },
  week: { month: 'short', day: 'numeric' },
  month: { month: 'short', year: 'numeric' },
} as const satisfies Record<InsightsInterval, object>

/** Input and output tokens per hour, day, week or month, as a line chart or a table. */
export default function TokensOverTime({
  interval,
  data,
  isLoading,
  error,
  onRetry,
}: Readonly<TokensOverTimeProps>) {
  const t = useTranslations('insights.overview.tokens')
  const tChart = useTranslations('insights.overview.chart')
  const format = useFormatter()
  const rows = data ? toTokenData(data) : []
  const series = [
    { key: 'input', label: t('input') },
    { key: 'output', label: t('output') },
  ]
  const formatX = (value: string | number) =>
    format.dateTime(new Date(value), DATE_FORMAT[data?.interval ?? interval])
  const formatValue = (value: number) =>
    format.number(value, { notation: 'compact', maximumFractionDigits: 1 })
  const isEmpty = data?.points.every((point) => point.requests === 0) === true

  let state: 'ready' | 'loading' | 'empty' | 'error' = 'ready'
  if (isLoading) state = 'loading'
  else if (error) state = 'error'
  else if (isEmpty) state = 'empty'

  return (
    <ChartFrame
      title={t('title')}
      labels={{ chart: tChart('chart'), table: tChart('table'), view: tChart('view') }}
      state={state}
      height={CHART_HEIGHT}
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
      <LineChart
        data={rows}
        xKey="start"
        series={series}
        height={CHART_HEIGHT}
        formatX={formatX}
        formatValue={formatValue}
        label={t('label', { interval })}
      />
    </ChartFrame>
  )
}
