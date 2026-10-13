// SPDX-License-Identifier: AGPL-3.0-only
'use client'

import { useFormatter, useNow, useTranslations } from 'next-intl'

import type { AgentDto } from '@surefy/contracts'
import { DataLocationBadge, StatusPill } from '@surefy/ui/components/DataDisplay'
import { ConfidenceChip } from '@surefy/ui/components/Feedback'
import type { ConfidenceThresholds } from '@surefy/ui/components/Feedback'

import { AGENT_STATUS_TONE, LAST_RUN_TONE } from '../AgentsList.constants'
import { getTrustDisplay, summarizeSharedWith } from '../AgentsList.utils'

const muted = <span className="text-muted-foreground">—</span>

/** The agent's status word; a published agent with unpublished changes says so. */
export function AgentStatusFact({ agent }: Readonly<{ agent: AgentDto }>) {
  const t = useTranslations('agents.list')
  return (
    <span className="flex flex-wrap items-center gap-1.5">
      <StatusPill tone={AGENT_STATUS_TONE[agent.status]} label={t(`status.${agent.status}`)} />
      {agent.hasUnpublishedChanges && (
        <span className="text-caption text-muted-foreground">{t('unpublishedChanges')}</span>
      )}
    </span>
  )
}

/** "Needs attention", with the reasons as the pill's description. */
export function AgentAttentionFact({ agent }: Readonly<{ agent: AgentDto }>) {
  const t = useTranslations('agents.list')
  if (agent.needsAttention.length === 0) return null
  const reasons = agent.needsAttention.map((reason) => t(`attention.reasons.${reason}`))
  return (
    <span title={reasons.join('\n')} className="inline-flex">
      <StatusPill tone="warning" label={t('attention.label')} />
      <span className="sr-only">{reasons.join('. ')}</span>
    </span>
  )
}

/** The model with where the data goes: your server, or the provider. */
export function AgentModelFact({ agent }: Readonly<{ agent: AgentDto }>) {
  const t = useTranslations('agents.list')
  const { model } = agent
  if (!model) return <span className="text-muted-foreground">{t('noModel')}</span>
  const isOnServer = model.source === 'local' || model.source === 'trained'
  return (
    <span className="flex min-w-0 flex-wrap items-center gap-1.5">
      <span className="text-label truncate font-medium">{model.displayName}</span>
      <DataLocationBadge
        location={isOnServer ? 'local' : 'provider'}
        label={
          isOnServer ? t('location.local') : t('location.provider', { provider: model.providerKey })
        }
      />
    </span>
  )
}

/** The last run's outcome and when it ran. */
export function AgentLastRunFact({ agent }: Readonly<{ agent: AgentDto }>) {
  const t = useTranslations('agents.list')
  const format = useFormatter()
  const now = useNow()
  if (!agent.lastRun) return <span className="text-muted-foreground">{t('noRuns')}</span>
  return (
    <span className="flex flex-wrap items-center gap-1.5">
      <StatusPill
        tone={LAST_RUN_TONE[agent.lastRun.status]}
        label={t(`lastRun.${agent.lastRun.status}`)}
      />
      <span className="text-caption text-muted-foreground">
        {format.relativeTime(new Date(agent.lastRun.at), now)}
      </span>
    </span>
  )
}

/** The trust score in the organization's colors, or "Not enough runs yet". */
export function AgentTrustFact({
  agent,
  thresholds,
}: Readonly<{ agent: AgentDto; thresholds: ConfidenceThresholds }>) {
  const t = useTranslations('agents.list')
  const trust = getTrustDisplay(agent)
  if (trust.kind === 'notEnough') {
    return <span className="text-caption text-muted-foreground">{t('trust.notEnough')}</span>
  }
  return (
    <span title={t('trust.definition')} className="inline-flex">
      <ConfidenceChip
        value={trust.value}
        thresholds={thresholds}
        bandLabels={{
          high: t('trust.bands.high'),
          medium: t('trust.bands.medium'),
          low: t('trust.bands.low'),
        }}
      />
    </span>
  )
}

/** Who can use the agent: everyone, a few teams and a count, or only its owner. */
export function AgentSharedWithFact({ agent }: Readonly<{ agent: AgentDto }>) {
  const t = useTranslations('agents.list')
  const summary = summarizeSharedWith(agent.sharedWith)
  if (summary.kind === 'everyone') return <span>{t('sharedWith.everyone')}</span>
  if (summary.kind === 'none') {
    return <span className="text-muted-foreground">{t('sharedWith.none')}</span>
  }
  const parts = [
    summary.teamNames.join(', '),
    summary.moreTeams > 0 ? t('sharedWith.moreTeams', { count: summary.moreTeams }) : '',
    summary.people > 0 ? t('sharedWith.people', { count: summary.people }) : '',
  ].filter(Boolean)
  return <span className="truncate">{parts.join(' · ') || muted}</span>
}
