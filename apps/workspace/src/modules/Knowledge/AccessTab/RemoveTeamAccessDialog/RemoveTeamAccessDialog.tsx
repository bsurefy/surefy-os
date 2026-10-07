// SPDX-License-Identifier: AGPL-3.0-only
'use client'

import { useQuery } from '@tanstack/react-query'
import { useTranslations } from 'next-intl'

import { knowledgeQueries } from '@/api/knowledge'
import type { TeamRefDto } from '@surefy/contracts'
import { ConfirmDialog } from '@surefy/ui/components/Overlay'
import { getErrorMessage } from '@surefy/web-core/errors'

/** Remove a team's access (T2): names the team and the agents that use the base on their behalf. */
export default function RemoveTeamAccessDialog({
  orgId,
  baseId,
  team,
  onConfirm,
  onClose,
}: Readonly<{
  orgId: string
  baseId: string
  team: TeamRefDto
  onConfirm: () => Promise<void>
  onClose: () => void
}>) {
  const t = useTranslations('knowledge.detail.access.remove')
  const tErrors = useTranslations('errors')
  const impact = useQuery(knowledgeQueries.accessImpact(orgId, baseId, team.id))

  const lines: string[] = []
  if (impact.data) {
    lines.push(t('impactMembers', { count: impact.data.memberCount, team: team.name }))
    if (impact.data.agentCount > 0) {
      lines.push(
        t('impactAgents', {
          count: impact.data.agentCount,
          names: impact.data.agents.map((agent) => agent.name).join(', '),
        }),
      )
    }
  }

  return (
    <ConfirmDialog
      open
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
      tier="T2"
      tone="destructive"
      title={t('title', { team: team.name })}
      description={t('description')}
      impact={lines}
      labels={{ confirm: t('confirm') }}
      error={impact.error ? getErrorMessage(impact.error, tErrors) : undefined}
      onConfirm={onConfirm}
    />
  )
}
