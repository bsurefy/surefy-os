// SPDX-License-Identifier: AGPL-3.0-only
'use client'

import Link from 'next/link'
import { useFormatter, useTranslations } from 'next-intl'

import type { AgentRunDetailDto, AgentRunStepDto } from '@surefy/contracts'
import { StatusPill } from '@surefy/ui/components/DataDisplay'
import { Section } from '@surefy/ui/components/Layout'

import { GUARD_OUTCOME_TONE, STEP_STATUS_TONE } from '../RunDetail.constants'
import { approvalSteps, guardCheckRows, isRunOpen } from '../RunDetail.utils'

import type { Route } from 'next'

interface RunSidePanelProps {
  run: AgentRunDetailDto
  steps: AgentRunStepDto[]
  approvalHref: (approvalId: string) => Route
}

/** Why the run did what it did, the Guard checks it met and the approvals it asked for. */
export default function RunSidePanel({ run, steps, approvalHref }: Readonly<RunSidePanelProps>) {
  const t = useTranslations('insights.runs.detail.side')
  const tSteps = useTranslations('insights.runs.detail.steps')
  const format = useFormatter()
  const { summary } = run
  const guardRows = guardCheckRows(summary)
  const approvals = approvalSteps(steps)

  let why
  if (summary) {
    why = (
      <div className="flex flex-col gap-3">
        <p className="text-body text-foreground">{summary.outcome}</p>
        <dl className="text-caption flex flex-col gap-1">
          <div className="flex gap-2">
            <dt className="text-muted-foreground">{t('toolsUsed')}</dt>
            <dd>{summary.toolsUsed.length > 0 ? summary.toolsUsed.join(', ') : t('noTools')}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="text-muted-foreground">{t('sources')}</dt>
            <dd className="tabular-nums">{format.number(summary.sourcesCount)}</dd>
          </div>
        </dl>
      </div>
    )
  } else {
    why = (
      <p className="text-body text-muted-foreground">
        {isRunOpen(run.status) ? t('whyPending') : t('whyNone')}
      </p>
    )
  }

  return (
    <aside aria-label={t('label')} className="flex flex-col gap-4">
      <Section title={t('why')}>{why}</Section>
      <Section title={t('dataTitle')}>
        <p className="text-body text-muted-foreground">{t('data')}</p>
      </Section>
      <Section title={t('guard')}>
        {guardRows.length === 0 ? (
          <p className="text-body text-muted-foreground">{t('noGuard')}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {guardRows.map((row) => (
              <li key={row.outcome} className="flex items-center justify-between gap-3">
                <StatusPill
                  label={t(`outcomes.${row.outcome}`)}
                  tone={GUARD_OUTCOME_TONE[row.outcome]}
                />
                <span className="text-body tabular-nums">{t('checks', { count: row.count })}</span>
              </li>
            ))}
          </ul>
        )}
      </Section>
      <Section title={t('approvals')}>
        {approvals.length === 0 ? (
          <p className="text-body text-muted-foreground">{t('noApprovals')}</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {approvals.map((step) => (
              <li key={step.seq} className="flex flex-col gap-1">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-body min-w-0 truncate">{step.name}</span>
                  <StatusPill
                    label={tSteps(`statuses.${step.status}`)}
                    tone={STEP_STATUS_TONE[step.status]}
                  />
                </div>
                {step.approvalId && (
                  <Link
                    href={approvalHref(step.approvalId)}
                    className="text-caption text-primary underline-offset-4 hover:underline"
                  >
                    {t('openApproval')}
                  </Link>
                )}
              </li>
            ))}
          </ul>
        )}
      </Section>
    </aside>
  )
}
