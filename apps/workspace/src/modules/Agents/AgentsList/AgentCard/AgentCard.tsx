// SPDX-License-Identifier: AGPL-3.0-only
'use client'

import { Bot } from 'lucide-react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'

import { IconTile } from '@surefy/ui/components/DataDisplay'

import {
  AgentAttentionFact,
  AgentLastRunFact,
  AgentModelFact,
  AgentSharedWithFact,
  AgentStatusFact,
  AgentTrustFact,
} from '../AgentFacts'
import AgentRowMenu from '../AgentRowMenu'

import type { AgentCardProps } from './AgentCard.types'

/**
 * One agent: name, description, status, model with where its data goes, last run, trust score,
 * runs this week, approvals waiting, who it is shared with and its owner. The whole card opens
 * the editor; the "⋯" menu sits above the link.
 */
export default function AgentCard({
  agent,
  href,
  thresholds,
  canCreate,
  onAction,
}: Readonly<AgentCardProps>) {
  const t = useTranslations('agents.list')
  const stat = (label: string, value: React.ReactNode) => (
    <div className="flex min-w-0 flex-col gap-0.5">
      <dt className="text-caption text-muted-foreground">{label}</dt>
      <dd className="text-label min-w-0">{value}</dd>
    </div>
  )
  return (
    <li className="border-border bg-surface hover:border-border-strong focus-within:ring-ring relative flex flex-col gap-4 rounded-xl border p-4 focus-within:ring-2">
      <div className="flex items-start gap-3">
        <IconTile icon={Bot} />
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <h3 className="text-body min-w-0 font-semibold">
            <Link
              href={href}
              className="block truncate outline-none after:absolute after:inset-0 after:content-['']"
            >
              {agent.name}
            </Link>
          </h3>
          <div className="flex flex-wrap items-center gap-1.5">
            <AgentStatusFact agent={agent} />
            <AgentAttentionFact agent={agent} />
          </div>
        </div>
        <div className="relative z-10">
          <AgentRowMenu agent={agent} canCreate={canCreate} onAction={onAction} />
        </div>
      </div>
      <p className="text-label text-foreground-secondary line-clamp-2 min-h-10">
        {agent.description ?? t('noDescription')}
      </p>
      <AgentModelFact agent={agent} />
      <dl className="border-border grid grid-cols-2 gap-x-4 gap-y-3 border-t pt-3">
        {stat(t('columns.lastRun'), <AgentLastRunFact agent={agent} />)}
        {stat(t('columns.trust'), <AgentTrustFact agent={agent} thresholds={thresholds} />)}
        {stat(t('columns.runsThisWeek'), t('runsCount', { count: agent.runsThisWeek }))}
        {stat(
          t('columns.approvals'),
          agent.approvalsWaiting > 0 ? t('approvalsCount', { count: agent.approvalsWaiting }) : '—',
        )}
        {stat(t('columns.sharedWith'), <AgentSharedWithFact agent={agent} />)}
        {stat(t('columns.owner'), agent.owner?.name ?? t('formerMember'))}
      </dl>
    </li>
  )
}
