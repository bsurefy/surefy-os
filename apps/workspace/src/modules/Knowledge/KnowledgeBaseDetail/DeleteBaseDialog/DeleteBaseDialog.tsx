// SPDX-License-Identifier: AGPL-3.0-only
'use client'

import { useQuery } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'

import { knowledgeQueries, useDeleteKnowledgeBaseMutation } from '@/api/knowledge'
import { ROUTES } from '@/constants/routes'
import { toRoute } from '@/modules/Workspace'
import type { KnowledgeBaseDto } from '@surefy/contracts'
import { toast } from '@surefy/ui/components/Feedback'
import { ConfirmDialog } from '@surefy/ui/components/Overlay'
import { getErrorMessage } from '@surefy/web-core/errors'

/**
 * Delete a knowledge base (T3: typed name): names the agents that use it and says it can be
 * restored for 30 days; sources and access come back with it.
 */
export default function DeleteBaseDialog({
  orgId,
  orgSlug,
  base,
  onClose,
}: Readonly<{ orgId: string; orgSlug: string; base: KnowledgeBaseDto; onClose: () => void }>) {
  const t = useTranslations('knowledge.detail.delete')
  const tErrors = useTranslations('errors')
  const router = useRouter()
  const impact = useQuery(knowledgeQueries.impact(orgId, base.id))
  const remove = useDeleteKnowledgeBaseMutation(orgId, { silent: true })

  const lines: string[] = []
  if (impact.data) {
    lines.push(t('impactSources', { count: impact.data.sourceCount }))
    if (impact.data.agentCount > 0) {
      lines.push(
        t('impactAgents', {
          count: impact.data.agentCount,
          names: impact.data.agents.map((agent) => agent.name).join(', '),
        }),
      )
    }
    if (impact.data.chatCount > 0) lines.push(t('impactChats', { count: impact.data.chatCount }))
  }

  const error = remove.error ?? impact.error
  return (
    <ConfirmDialog
      open
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
      tier="T3"
      tone="destructive"
      title={t('title', { name: base.name })}
      description={t('description', { days: impact.data?.restoreWindowDays ?? 30 })}
      impact={lines}
      confirmationText={base.name}
      labels={{
        confirm: t('confirm'),
        reason: t('reason'),
        reasonHelp: t('reasonHelp'),
        reasonRequired: t('reasonRequired'),
        typeToConfirm: (name) => t('typeToConfirm', { name }),
        typeMismatch: (name) => t('typeMismatch', { name }),
      }}
      error={error ? getErrorMessage(error, tErrors) : undefined}
      onConfirm={async () => {
        await remove.mutateAsync(base.id)
        toast.success(t('deleted', { name: base.name }))
        router.push(toRoute(ROUTES.workspace.knowledge(orgSlug)))
      }}
    />
  )
}
