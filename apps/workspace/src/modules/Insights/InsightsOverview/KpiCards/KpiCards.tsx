// SPDX-License-Identifier: AGPL-3.0-only
'use client'

import { useFormatter, useTranslations } from 'next-intl'

import type { InsightsCostDto, InsightsOverviewDto } from '@surefy/contracts'
import { StatCard } from '@surefy/ui/components/DataDisplay'
import { ErrorState, SkeletonStat } from '@surefy/ui/components/Feedback'

import { microsToUnits } from '../InsightsOverview.utils'

interface KpiCardsProps {
  data: InsightsOverviewDto | undefined
  isLoading: boolean
  error: { message: string; reference?: string } | null
  onRetry: () => void
}

type Metric<T> = { state: 'value'; value: T } | { state: 'restricted' }

/** The MVP KPIs: messages, active people, tokens and cost this month. */
export default function KpiCards({ data, isLoading, error, onRetry }: Readonly<KpiCardsProps>) {
  const t = useTranslations('insights.overview.kpis')
  const format = useFormatter()

  const money = (cost: InsightsCostDto) =>
    cost.length === 0
      ? format.number(0, { style: 'currency', currency: 'USD' })
      : cost
          .map((entry) =>
            format.number(microsToUnits(entry.costMicros), {
              style: 'currency',
              currency: entry.currency,
            }),
          )
          .join(' · ')

  const card = <T,>(label: string, metric: Metric<T> | undefined, show: (value: T) => string) => {
    if (metric?.state === 'restricted') {
      return <StatCard label={label} value="—" isRestricted restrictedLabel={t('restricted')} />
    }
    return <StatCard label={label} value={metric ? show(metric.value) : '—'} />
  }

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-busy>
        {[0, 1, 2, 3].map((index) => (
          <SkeletonStat key={index} />
        ))}
      </div>
    )
  }

  return (
    <section aria-label={t('label')} className="flex flex-col gap-3">
      {error && (
        <ErrorState
          title={t('loadError')}
          message={error.message}
          reference={error.reference}
          onRetry={onRetry}
        />
      )}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {card(t('messages'), data?.messages, (value) => format.number(value))}
        {card(t('activePeople'), data?.activePeople, (value) => format.number(value))}
        {card(t('tokens'), data?.tokens, (value) =>
          format.number(value, { notation: 'compact', maximumFractionDigits: 1 }),
        )}
        {card(t('costThisMonth'), data?.costThisMonth, money)}
      </div>
    </section>
  )
}
