// SPDX-License-Identifier: AGPL-3.0-only
'use client'

import { ListTree } from 'lucide-react'
import { useFormatter, useTranslations } from 'next-intl'

import { EmptyState, StatusPill } from '@surefy/ui/components/DataDisplay'
import { Section } from '@surefy/ui/components/Layout'

import { microsToUnits, splitDuration } from '../../AgentEditor.utils'
import { RUN_STATUS_TONE } from '../TestTab.constants'
import StepRow from './StepRow'

import type { StepTraceView } from './StepTrace.types'

/** The steps of the latest test run, as they happen: knowledge, model, tools, decisions, approvals. */
export default function StepTrace({ view }: Readonly<{ view: StepTraceView }>) {
  const t = useTranslations('agents.editor.test.trace')
  const tStep = useTranslations('agents.editor.test.step')
  const format = useFormatter()
  const { trace, totals } = view
  const duration = splitDuration(totals.durationMs)

  const summary =
    totals.count === 0
      ? null
      : [
          t('stepCount', { count: totals.count }),
          tStep(`duration.${duration.unit}`, {
            value: format.number(duration.value, { maximumFractionDigits: 1 }),
          }),
          tStep('tokens', { count: totals.tokens }),
          format.number(microsToUnits(totals.costMicros), {
            style: 'currency',
            currency: totals.currency,
            maximumFractionDigits: 4,
          }),
        ].join(' · ')

  return (
    <Section
      title={t('title')}
      description={summary ?? t('description')}
      actions={
        trace.status && (
          <StatusPill
            label={t(`status.${trace.status}`)}
            tone={RUN_STATUS_TONE[trace.status]}
            isPulsing={trace.status === 'running'}
          />
        )
      }
    >
      {trace.steps.length === 0 ? (
        <EmptyState
          icon={ListTree}
          headingLevel={3}
          title={trace.status === null ? t('empty.title') : t('starting')}
          description={trace.status === null ? t('empty.description') : undefined}
        />
      ) : (
        <ol aria-label={t('title')} className="flex flex-col gap-2">
          {trace.steps.map((step) => (
            <StepRow key={step.seq} step={step} view={view} approval={trace.approvals[step.seq]} />
          ))}
        </ol>
      )}
    </Section>
  )
}
