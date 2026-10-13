// SPDX-License-Identifier: AGPL-3.0-only
'use client'

import { useFormatter, useTranslations } from 'next-intl'

import type { AgentRunDetailDto } from '@surefy/contracts'
import { Section } from '@surefy/ui/components/Layout'

import { microsToUnits, splitDuration } from '../../../InsightsOverview/InsightsOverview.utils'

interface RunFactsProps {
  run: AgentRunDetailDto
  timeZone: string
}

/** Started, duration, cost, tokens, model and where the data went. */
export default function RunFacts({ run, timeZone }: Readonly<RunFactsProps>) {
  const t = useTranslations('insights.runs.detail.facts')
  const tRuns = useTranslations('insights.runs')
  const format = useFormatter()
  const duration = run.durationMs === null ? null : splitDuration(run.durationMs)
  const isLocal = run.model?.source === 'local'

  const facts: [string, string][] = [
    [
      t('started'),
      run.startedAt
        ? `${format.dateTime(new Date(run.startedAt), { dateStyle: 'medium', timeStyle: 'medium' })} (${timeZone})`
        : t('notStarted'),
    ],
    [
      t('duration'),
      duration
        ? tRuns(`duration.${duration.unit}`, {
            value: format.number(duration.value, { maximumFractionDigits: 1 }),
          })
        : '—',
    ],
    [
      t('cost'),
      isLocal
        ? tRuns('local')
        : format.number(microsToUnits(run.costMicros), {
            style: 'currency',
            currency: run.currency,
            maximumFractionDigits: 4,
          }),
    ],
    [
      t('tokens'),
      t('tokensValue', {
        input: format.number(run.inputTokens),
        output: format.number(run.outputTokens),
      }),
    ],
    [t('model'), run.model?.displayName ?? '—'],
    [
      t('dataLocation'),
      run.dataLocations.length === 0
        ? '—'
        : run.dataLocations.map((location) => t(`dataLocations.${location}`)).join(', '),
    ],
  ]

  return (
    <Section title={t('title')}>
      <dl className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2 xl:grid-cols-3">
        {facts.map(([label, value]) => (
          <div key={label} className="flex min-w-0 flex-col gap-0.5">
            <dt className="text-caption text-muted-foreground">{label}</dt>
            <dd className="text-body text-foreground tabular-nums">{value}</dd>
          </div>
        ))}
      </dl>
    </Section>
  )
}
