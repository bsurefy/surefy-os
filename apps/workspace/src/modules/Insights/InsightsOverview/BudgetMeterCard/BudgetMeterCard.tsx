// SPDX-License-Identifier: AGPL-3.0-only
'use client'

import { Lock } from 'lucide-react'
import Link from 'next/link'
import { useFormatter, useTranslations } from 'next-intl'

import type { BudgetMeterDto, InsightsBudgetMeterDto } from '@surefy/contracts'
import { Meter } from '@surefy/ui/components/DataDisplay'
import { ErrorState, SkeletonStat } from '@surefy/ui/components/Feedback'
import { Button } from '@surefy/ui/primitives/button'

import { basisPointsToShare, microsToUnits } from '../InsightsOverview.utils'

import type { Route } from 'next'

interface BudgetMeterCardProps {
  data: InsightsBudgetMeterDto | undefined
  isLoading: boolean
  error: { message: string; reference?: string } | null
  onRetry: () => void
  /** Whose budget: the person filter, else the team filter, else the organization. */
  scope: { kind: 'organization' | 'team' | 'person'; name: string | null }
  /** Settings › Usage & budgets, for people who may read budgets. */
  budgetsHref: Route | null
}

/**
 * The meter takes the server's state: `warningAt` 0 shows the warning color from the first cent,
 * 1 never shows it before the limit, so the color follows the budget's own alert threshold.
 */
const WARNING_AT: Record<BudgetMeterDto['state'], number> = { ok: 1, warning: 0, reached: 0 }

/** Cost this month against the budget of the scope in the filters: the V1 budget meter. */
export default function BudgetMeterCard({
  data,
  isLoading,
  error,
  onRetry,
  scope,
  budgetsHref,
}: Readonly<BudgetMeterCardProps>) {
  const t = useTranslations('insights.overview.budget')
  const format = useFormatter()

  if (isLoading) return <SkeletonStat />

  const scopeName =
    scope.kind === 'organization'
      ? t('scopes.organization')
      : (scope.name ?? t(`scopes.${scope.kind}`))
  const title = t('title', { scope: scopeName })
  const manageLink = budgetsHref && (
    <Button variant="link" size="sm" asChild className="h-auto p-0">
      <Link href={budgetsHref}>{t('manage')}</Link>
    </Button>
  )

  let body
  if (error) {
    body = (
      <ErrorState
        title={t('loadError')}
        message={error.message}
        reference={error.reference}
        onRetry={onRetry}
      />
    )
  } else if (data?.meter.state === 'restricted') {
    body = (
      <p className="text-body text-muted-foreground flex items-center gap-1.5">
        <Lock aria-hidden className="size-3.5" />
        {t('restricted')}
      </p>
    )
  } else if (!data?.meter.value) {
    body = (
      <p className="text-body text-muted-foreground">
        {t('none')}
        {budgetsHref && (
          <>
            {' · '}
            <Link href={budgetsHref} className="text-primary underline-offset-4 hover:underline">
              {t('setOne')}
            </Link>
          </>
        )}
      </p>
    )
  } else {
    const meter = data.meter.value
    const money = (micros: number) =>
      format.number(microsToUnits(micros), { style: 'currency', currency: meter.currency })
    const periodEnd = format.dateTime(new Date(`${meter.periodEnd}T12:00:00Z`), {
      dateStyle: 'medium',
      timeZone: 'UTC',
    })
    body = (
      <div className="flex flex-col gap-2">
        <Meter
          label={title}
          value={meter.spentMicros}
          max={meter.effectiveAmountMicros}
          valueText={t('value', {
            spent: money(meter.spentMicros),
            amount: money(meter.effectiveAmountMicros),
            percent: format.number(basisPointsToShare(meter.usedBp), {
              style: 'percent',
              maximumFractionDigits: 0,
            }),
          })}
          warningAt={WARNING_AT[meter.state]}
        />
        <p className="text-caption text-muted-foreground">
          {meter.state === 'reached'
            ? t(`reached.${meter.onReached}`, { date: periodEnd })
            : t('resets', { date: periodEnd })}
          {meter.effectiveAmountMicros < meter.amountMicros &&
            ` · ${t('capped', { amount: money(meter.amountMicros) })}`}
        </p>
      </div>
    )
  }

  const hasMeter = !error && data?.meter.state === 'value' && data.meter.value !== null
  return (
    <section
      aria-label={title}
      className="border-border bg-surface flex flex-col gap-3 rounded-xl border p-5"
    >
      {!hasMeter && <h2 className="text-label text-foreground">{title}</h2>}
      {body}
      {hasMeter && manageLink}
    </section>
  )
}
