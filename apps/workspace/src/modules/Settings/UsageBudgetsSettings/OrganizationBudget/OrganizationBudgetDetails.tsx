// SPDX-License-Identifier: AGPL-3.0-only
'use client'

import { useFormatter, useTranslations } from 'next-intl'

import type { BudgetDto } from '@surefy/contracts'
import { StatusPill } from '@surefy/ui/components/DataDisplay'

import BudgetMeter from '../BudgetMeter'
import { useFormatBudgetDate } from '../UsageBudgetsSettings.hooks'
import { bpToPercent } from '../UsageBudgetsSettings.utils'

/** The organization budget's meter, what happens when it is reached, its alerts and its reset. */
export default function OrganizationBudgetDetails({ budget }: Readonly<{ budget: BudgetDto }>) {
  const t = useTranslations('settings.usage')
  const format = useFormatter()
  const formatDate = useFormatBudgetDate()

  const facts = [
    { label: t('columns.onReached'), value: t(`onReached.${budget.onReached}.label`) },
    {
      label: t('columns.alerts'),
      value:
        budget.alertThresholdsBp.length > 0
          ? budget.alertThresholdsBp.map((bp) => `${String(bpToPercent(bp))}%`).join(', ')
          : t('noAlerts'),
    },
  ]
  if (budget.lastAlert) {
    facts.push({
      label: t('organization.lastAlert'),
      value: t('lastAlert', {
        percent: bpToPercent(budget.lastAlert.thresholdBp),
        date: format.dateTime(new Date(budget.lastAlert.triggeredAt), {
          month: 'short',
          day: 'numeric',
        }),
      }),
    })
  }
  if (budget.meter) {
    facts.push({ label: t('organization.resets'), value: formatDate(budget.meter.periodEnd) })
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <StatusPill
          label={budget.isEnabled ? t('status.on') : t('status.off')}
          tone={budget.isEnabled ? 'success' : 'neutral'}
        />
      </div>
      <BudgetMeter budget={budget} />
      <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
        {facts.map((fact) => (
          <div key={fact.label} className="flex flex-col">
            <dt className="text-caption text-muted-foreground">{fact.label}</dt>
            <dd className="text-body">{fact.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  )
}
