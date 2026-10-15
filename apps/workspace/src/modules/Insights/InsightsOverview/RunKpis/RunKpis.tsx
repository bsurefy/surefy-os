// SPDX-License-Identifier: AGPL-3.0-only
'use client'

import { useFormatter, useTranslations } from 'next-intl'

import type { InsightsRunsOverviewDto } from '@surefy/contracts'
import { StatCard } from '@surefy/ui/components/DataDisplay'
import { ErrorState, SkeletonStat } from '@surefy/ui/components/Feedback'

import { basisPointsToShare, splitDuration } from '../InsightsOverview.utils'

interface RunKpisProps {
  data: InsightsRunsOverviewDto | undefined
  isLoading: boolean
  error: { message: string; reference?: string } | null
  onRetry: () => void
  /** A team, person or model filter is on: the run numbers do not follow it. */
  hasUsageOnlyFilters: boolean
}

type Metric<T> = { state: 'value'; value: T } | { state: 'restricted' }

/** The V1 KPIs: finished runs, success rate, average duration and approvals decided by people. */
export default function RunKpis({
  data,
  isLoading,
  error,
  onRetry,
  hasUsageOnlyFilters,
}: Readonly<RunKpisProps>) {
  const t = useTranslations('insights.overview.runKpis')
  const format = useFormatter()

  const card = <T,>(
    label: string,
    metric: Metric<T> | undefined,
    show: (value: T) => string,
    describe?: (value: T) => string | undefined,
  ) => {
    if (metric?.state === 'restricted') {
      return <StatCard label={label} value="—" isRestricted restrictedLabel={t('restricted')} />
    }
    return (
      <StatCard
        label={label}
        value={metric ? show(metric.value) : '—'}
        description={metric ? describe?.(metric.value) : t('unavailable')}
      />
    )
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
        {card(t('runs'), data?.runs, (value) => format.number(value))}
        {card(t('successRate'), data?.successRateBp, (value) =>
          value === null
            ? '—'
            : format.number(basisPointsToShare(value), {
                style: 'percent',
                maximumFractionDigits: 1,
              }),
        )}
        {card(t('averageDuration'), data?.averageDurationMs, (value) => {
          if (value === null) return '—'
          const duration = splitDuration(value)
          return t(`duration.${duration.unit}`, {
            value: format.number(duration.value, { maximumFractionDigits: 1 }),
          })
        })}
        {card(
          t('approvalsByPeople'),
          data?.approvals,
          (value) => format.number(value.decidedByPeople),
          (value) =>
            value.requested === 0
              ? undefined
              : t('approvalsDetail', { approved: value.approved, rejected: value.rejected }),
        )}
      </div>
      {hasUsageOnlyFilters && <p className="text-caption text-muted-foreground">{t('scope')}</p>}
    </section>
  )
}
