// SPDX-License-Identifier: AGPL-3.0-only
'use client'

import { useTranslations } from 'next-intl'

import type { BudgetDto } from '@surefy/contracts'
import { Meter } from '@surefy/ui/components/DataDisplay'
import { cn } from '@surefy/ui/lib/utils'

import { useFormatBudgetDate, useFormatMoney } from '../UsageBudgetsSettings.hooks'
import { bpToPercent, getWarningShare } from '../UsageBudgetsSettings.utils'

/**
 * This month's spend against the amount that applies, with what is happening once it is reached
 * and when an organization budget below this one caps it. A turned-off budget has no meter.
 */
export default function BudgetMeter({
  budget,
  className,
}: Readonly<{ budget: BudgetDto; className?: string }>) {
  const t = useTranslations('settings.usage.meter')
  const formatMoney = useFormatMoney()
  const formatDate = useFormatBudgetDate()
  const { meter } = budget

  if (!meter) {
    return <span className="text-caption text-muted-foreground">{t('off')}</span>
  }

  const money = (micros: number) => formatMoney(micros, meter.currency)
  return (
    <div className={cn('flex min-w-40 flex-col gap-1', className)}>
      <Meter
        label={t('used', { percent: Math.floor(bpToPercent(meter.usedBp)) })}
        value={meter.spentMicros}
        max={meter.effectiveAmountMicros}
        valueText={t('of', {
          spent: money(meter.spentMicros),
          amount: money(meter.effectiveAmountMicros),
        })}
        warningAt={getWarningShare(budget.alertThresholdsBp)}
      />
      {meter.state === 'reached' && (
        <span className="text-caption text-destructive">
          {t(`reached.${meter.onReached}`, { date: formatDate(meter.periodEnd) })}
        </span>
      )}
      {meter.effectiveAmountMicros < meter.amountMicros && (
        <span className="text-caption text-muted-foreground">
          {t('capped', { amount: money(meter.amountMicros) })}
        </span>
      )}
    </div>
  )
}
