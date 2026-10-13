// SPDX-License-Identifier: AGPL-3.0-only
'use client'

import { ChevronRight, ListTree } from 'lucide-react'
import Link from 'next/link'
import { useFormatter, useTranslations } from 'next-intl'

import { StepData } from '@/modules/Agents'
import type { AgentRunStepDto } from '@surefy/contracts'
import { EmptyState, StatusPill } from '@surefy/ui/components/DataDisplay'
import {
  ConfidenceChip,
  ErrorState,
  SkeletonRows,
  type ConfidenceThresholds,
} from '@surefy/ui/components/Feedback'
import { Section } from '@surefy/ui/components/Layout'

import { microsToUnits, splitDuration } from '../../../InsightsOverview/InsightsOverview.utils'
import { STEP_ICONS, STEP_STATUS_TONE } from '../RunDetail.constants'
import { stepTotals } from '../RunDetail.utils'

import type { WaterfallBar } from '../RunDetail.utils'
import type { Route } from 'next'

interface StepWaterfallProps {
  orgId: string
  runId: string
  steps: AgentRunStepDto[]
  waterfall: Map<number, WaterfallBar>
  isExpired: boolean
  isLoading: boolean
  errorMessage: string | null
  onRetry: () => void
  thresholds: ConfidenceThresholds
  openSeqs: ReadonlySet<number>
  onToggle: (seq: number) => void
  errorOf: (code: string | null) => string
  retentionDays: number
  dataPrivacyHref: Route
}

/**
 * The run's steps on one timeline: each bar starts when its step started and is as long as it
 * took, with the step's time, tokens and cost; a step opens to its input and output.
 */
export default function StepWaterfall({
  orgId,
  runId,
  steps,
  waterfall,
  isExpired,
  isLoading,
  errorMessage,
  onRetry,
  thresholds,
  openSeqs,
  onToggle,
  errorOf,
  retentionDays,
  dataPrivacyHref,
}: Readonly<StepWaterfallProps>) {
  const t = useTranslations('insights.runs.detail.steps')
  const tRuns = useTranslations('insights.runs')
  const format = useFormatter()
  const totals = stepTotals(steps)
  const money = (micros: number, currency: string) =>
    format.number(microsToUnits(micros), {
      style: 'currency',
      currency,
      maximumFractionDigits: 4,
    })
  const durationText = (ms: number) => {
    const duration = splitDuration(ms)
    return tRuns(`duration.${duration.unit}`, {
      value: format.number(duration.value, { maximumFractionDigits: 1 }),
    })
  }

  let body
  if (isLoading) body = <SkeletonRows rows={4} />
  else if (errorMessage) {
    body = <ErrorState title={t('loadError')} message={errorMessage} onRetry={onRetry} />
  } else if (isExpired) {
    body = (
      <EmptyState
        icon={ListTree}
        size="sm"
        headingLevel={3}
        title={t('expired.title', { days: retentionDays })}
        description={t('expired.description')}
        secondaryAction={
          <Link
            href={dataPrivacyHref}
            className="text-primary text-body underline-offset-4 hover:underline"
          >
            {t('expired.link')}
          </Link>
        }
      />
    )
  } else if (steps.length === 0) {
    body = <EmptyState icon={ListTree} size="sm" headingLevel={3} title={t('empty')} />
  } else {
    body = (
      <ol aria-label={t('title')} className="flex flex-col gap-2">
        {steps.map((step) => {
          const Icon = STEP_ICONS[step.type]
          const isOpen = openSeqs.has(step.seq)
          const bar = waterfall.get(step.seq) ?? { offset: 0, width: 0 }
          const tokens = step.inputTokens + step.outputTokens
          return (
            <li key={step.seq} className="border-border bg-surface rounded-lg border">
              <button
                type="button"
                aria-expanded={isOpen}
                aria-label={t(isOpen ? 'collapse' : 'expand', { name: step.name })}
                onClick={() => {
                  onToggle(step.seq)
                }}
                className="hover:bg-surface-2 focus-visible:outline-ring flex w-full items-center gap-3 rounded-lg p-3 text-start focus-visible:outline-2 focus-visible:outline-offset-2"
              >
                <ChevronRight
                  aria-hidden
                  className={`text-muted-foreground size-4 shrink-0 transition-transform ${isOpen ? 'rotate-90' : ''}`}
                />
                <Icon aria-hidden className="text-muted-foreground size-4 shrink-0" />
                <span className="flex min-w-0 flex-1 flex-col gap-1">
                  <span className="flex min-w-0 items-baseline gap-2">
                    <span className="text-body truncate font-medium">{step.name}</span>
                    <span className="text-caption text-muted-foreground shrink-0">
                      {t(`types.${step.type}`)}
                    </span>
                  </span>
                  <span aria-hidden className="bg-surface-2 relative block h-1.5 rounded-full">
                    <span
                      className="bg-primary/50 absolute inset-y-0 block rounded-full"
                      style={{
                        left: `${String(bar.offset * 100)}%`,
                        width: `${String(bar.width * 100)}%`,
                      }}
                    />
                  </span>
                  <span className="text-caption text-muted-foreground flex flex-wrap gap-x-3 tabular-nums">
                    {step.durationMs !== null && <span>{durationText(step.durationMs)}</span>}
                    {tokens > 0 && <span>{t('tokens', { count: tokens })}</span>}
                    {step.costMicros > 0 && <span>{money(step.costMicros, step.currency)}</span>}
                    {step.errorCode && (
                      <span className="text-destructive">{errorOf(step.errorCode)}</span>
                    )}
                  </span>
                </span>
                {step.confidence !== null && (
                  <ConfidenceChip
                    value={step.confidence}
                    thresholds={thresholds}
                    bandLabels={{
                      high: tRuns('bands.high'),
                      medium: tRuns('bands.medium'),
                      low: tRuns('bands.low'),
                    }}
                  />
                )}
                <StatusPill
                  label={t(`statuses.${step.status}`)}
                  tone={STEP_STATUS_TONE[step.status]}
                />
              </button>
              {isOpen && (
                <div className="border-border border-t p-3">
                  <StepData orgId={orgId} runId={runId} seq={step.seq} />
                </div>
              )}
            </li>
          )
        })}
      </ol>
    )
  }

  return (
    <Section
      title={t('title')}
      description={
        steps.length > 0
          ? [
              t('count', { count: totals.count }),
              t('tokens', { count: totals.tokens }),
              money(totals.costMicros, totals.currency),
            ].join(' · ')
          : undefined
      }
    >
      {body}
    </Section>
  )
}
