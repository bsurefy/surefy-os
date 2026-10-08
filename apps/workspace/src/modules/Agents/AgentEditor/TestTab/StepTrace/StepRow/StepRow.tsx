// SPDX-License-Identifier: AGPL-3.0-only
'use client'

import { ChevronRight } from 'lucide-react'
import Link from 'next/link'
import { useFormatter, useTranslations } from 'next-intl'

import { toRoute } from '@/modules/Workspace'
import type { AgentRunApprovalData, AgentRunStepEvent } from '@surefy/contracts'
import { StatusPill } from '@surefy/ui/components/DataDisplay'
import { Banner, ConfidenceChip } from '@surefy/ui/components/Feedback'
import { Button } from '@surefy/ui/primitives/button'

import { microsToUnits, splitDuration } from '../../../AgentEditor.utils'
import { STEP_ICONS, STEP_STATUS_TONE } from '../../TestTab.constants'
import { barShare } from '../../TestTab.utils'
import StepData from '../StepData'

import type { StepTraceView } from '../StepTrace.types'

interface StepRowProps {
  step: AgentRunStepEvent
  view: StepTraceView
  approval: AgentRunApprovalData | undefined
}

/** One step of the trace: what it was, how it went and what it cost; it opens to its input and output. */
export default function StepRow({ step, view, approval }: Readonly<StepRowProps>) {
  const t = useTranslations('agents.editor.test.step')
  const format = useFormatter()
  const Icon = STEP_ICONS[step.type]
  const isOpen = view.openSeqs.has(step.seq)
  const duration = step.durationMs === null ? null : splitDuration(step.durationMs)
  const tokens = step.inputTokens + step.outputTokens
  const isWaiting = step.status === 'waiting' && step.approvalId !== null
  const isFailedTool = step.type === 'tool' && step.status === 'failed'
  const share = barShare(step.durationMs, view.longestMs)

  return (
    <li className="border-border bg-surface rounded-lg border">
      <button
        type="button"
        aria-expanded={isOpen}
        aria-label={t(isOpen ? 'collapse' : 'expand', { name: step.name })}
        onClick={() => {
          view.onToggle(step.seq)
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
          <span aria-hidden className="bg-surface-2 block h-1 rounded-full">
            <span
              className="bg-primary/40 block h-1 rounded-full"
              style={{ width: `${Math.round(share * 100)}%` }}
            />
          </span>
          <span className="text-caption text-muted-foreground flex flex-wrap gap-x-3 tabular-nums">
            {duration && (
              <span>
                {t(`duration.${duration.unit}`, {
                  value: format.number(duration.value, { maximumFractionDigits: 1 }),
                })}
              </span>
            )}
            {tokens > 0 && <span>{t('tokens', { count: tokens })}</span>}
            {step.costMicros > 0 && (
              <span>
                {format.number(microsToUnits(step.costMicros), {
                  style: 'currency',
                  currency: step.currency,
                  maximumFractionDigits: 4,
                })}
              </span>
            )}
            {step.status === 'skipped' && <span>{t('skipped')}</span>}
          </span>
        </span>
        {step.confidence !== null && (
          <ConfidenceChip
            value={step.confidence}
            thresholds={view.thresholds}
            bandLabels={{
              high: t('bands.high'),
              medium: t('bands.medium'),
              low: t('bands.low'),
            }}
          />
        )}
        <StatusPill label={t(`statuses.${step.status}`)} tone={STEP_STATUS_TONE[step.status]} />
      </button>
      {isWaiting && (
        <div className="border-border flex flex-wrap items-center justify-between gap-3 border-t px-3 py-2.5">
          <p className="text-body text-foreground-secondary">
            {approval && approval.assignees.length > 0
              ? t('waitingFor', {
                  names: approval.assignees
                    .map((assignee) => assignee.user?.name ?? assignee.team?.name ?? assignee.role)
                    .filter(Boolean)
                    .join(', '),
                })
              : t('waiting')}
          </p>
          {view.canApprove && step.approvalId && (
            <Button
              size="sm"
              isLoading={view.isApproving}
              onClick={() => {
                if (step.approvalId) view.onApprove(step.approvalId)
              }}
            >
              {t('approve')}
            </Button>
          )}
        </div>
      )}
      {isFailedTool && (
        <div className="border-border border-t p-3">
          <Banner
            tone="destructive"
            title={t('failed')}
            description={view.errorOf(step.errorCode)}
            action={
              <div className="flex gap-2">
                {view.failedSeq === step.seq && view.canRetryStep && (
                  <Button size="sm" isLoading={view.isRetrying} onClick={view.onRetryStep}>
                    {t('retry')}
                  </Button>
                )}
                <Button size="sm" variant="secondary" asChild>
                  <Link href={toRoute(view.toolsHref)}>{t('openTool')}</Link>
                </Button>
              </div>
            }
          />
        </div>
      )}
      {isOpen && view.runId && (
        <div className="border-border border-t p-3">
          <StepData orgId={view.orgId} runId={view.runId} seq={step.seq} />
        </div>
      )}
    </li>
  )
}
