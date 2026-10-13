// SPDX-License-Identifier: AGPL-3.0-only
'use client'

import Link from 'next/link'
import { useFormatter, useNow, useTranslations } from 'next-intl'

import { ROUTES } from '@/constants/routes'
import { formatMicros } from '@/modules/Workspace'
import type { ApprovalDetailDto } from '@surefy/contracts'
import { Section } from '@surefy/ui/components/Layout'

import { useApprovalLabels } from '../../Approvals.hooks'

import type { ReactNode } from 'react'

/** The rule, amount, confidence, risk, who asked and who may decide, and what happens on a timeout. */
export default function FactsSection({
  item,
  orgSlug,
}: Readonly<{ item: ApprovalDetailDto; orgSlug: string }>) {
  const t = useTranslations('insights.approvals.detail.facts')
  const tTimeout = useTranslations('insights.approvals.detail.timeoutActions')
  const format = useFormatter()
  const now = useNow()
  const labels = useApprovalLabels()
  const from = item.agent?.name ?? item.flow?.name ?? item.requestedBy?.name

  const facts: [string, ReactNode][] = [
    [t('kind'), labels.kind(item.kind)],
    [t('from'), from],
    [
      t('requestedBy'),
      item.requestedBy && item.kind !== 'ai_action' ? item.requestedBy.name : null,
    ],
    [t('rule'), item.ruleName],
    [
      t('amount'),
      item.amountMicros === null ? null : formatMicros(format, item.amountMicros, item.currency),
    ],
    [
      t('confidence'),
      item.confidence === null
        ? null
        : format.number(item.confidence, { style: 'percent', maximumFractionDigits: 0 }),
    ],
    [t('risk'), labels.risk(item.risk)],
    [t('waiting'), format.relativeTime(new Date(item.createdAt), now)],
    [t('assignees'), labels.assignees(item)],
    [
      t('expires'),
      item.status === 'pending' && item.expiresAt
        ? format.dateTime(new Date(item.expiresAt), { dateStyle: 'medium', timeStyle: 'short' })
        : null,
    ],
    [
      t('timeoutAction'),
      item.status === 'pending' && item.timeoutAction ? tTimeout(item.timeoutAction) : null,
    ],
    [
      t('run'),
      item.agentRunId ? (
        <Link
          className="text-primary hover:underline"
          href={ROUTES.workspace.run(orgSlug, item.agentRunId)}
        >
          {item.agentRunId.slice(0, 8)}
        </Link>
      ) : null,
    ],
  ]

  return (
    <Section title={t('title')}>
      <dl className="flex flex-col gap-3">
        {facts
          .filter(([, value]) => value !== null && value !== undefined && value !== '')
          .map(([label, value]) => (
            <div key={label} className="flex flex-col gap-0.5">
              <dt className="text-caption text-muted-foreground">{label}</dt>
              <dd className="text-body">{value}</dd>
            </div>
          ))}
      </dl>
    </Section>
  )
}
