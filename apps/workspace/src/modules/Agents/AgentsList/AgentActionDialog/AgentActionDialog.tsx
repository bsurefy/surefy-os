// SPDX-License-Identifier: AGPL-3.0-only
'use client'

import { useQuery } from '@tanstack/react-query'
import { useTranslations } from 'next-intl'

import { agentQueries, useAgentLifecycleMutation, useDeleteAgentMutation } from '@/api/agents'
import { toast } from '@surefy/ui/components/Feedback'
import { ConfirmDialog } from '@surefy/ui/components/Overlay'
import { Button } from '@surefy/ui/primitives/button'
import { getErrorMessage } from '@surefy/web-core/errors'

import { getImpactLines } from './AgentActionDialog.utils'

import type { AgentActionDialogProps } from './AgentActionDialog.types'
import type { ReactNode } from 'react'

/**
 * The confirmation of a pause or an archive of a published agent (T2: names who it is shared with
 * and which live channels stop answering), and of deleting a published agent or one with runs
 * (T3: type the name, give a reason). The consequences are read when it opens.
 */
export default function AgentActionDialog({
  orgId,
  action,
  agent,
  onClose,
}: Readonly<AgentActionDialogProps>) {
  const t = useTranslations(`agents.list.dialogs.${action}`)
  const tImpact = useTranslations('agents.list.dialogs.impact')
  const tErrors = useTranslations('errors')
  const impact = useQuery(agentQueries.impact(orgId, agent.id, action))
  const lifecycle = useAgentLifecycleMutation(orgId, { silent: true })
  const remove = useDeleteAgentMutation(orgId, { silent: true })
  const isDelete = action === 'delete'

  const lines: ReactNode[] =
    impact.data && !isDelete
      ? getImpactLines(impact.data).map(({ key, count }) => tImpact(key, { count }))
      : []

  let error: ReactNode
  if (impact.error) {
    error = (
      <span className="flex flex-wrap items-center gap-2">
        {tImpact('unavailable')}
        <Button
          variant="link"
          size="sm"
          onClick={() => {
            void impact.refetch()
          }}
        >
          {tImpact('retry')}
        </Button>
      </span>
    )
  } else if (lifecycle.error ?? remove.error) {
    error = getErrorMessage(lifecycle.error ?? remove.error, tErrors)
  }

  return (
    <ConfirmDialog
      open
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
      tier={isDelete ? 'T3' : 'T2'}
      tone="destructive"
      title={t('title', { name: agent.name })}
      description={
        isDelete ? t('description', { count: impact.data?.runCount ?? 0 }) : t('description')
      }
      impact={lines}
      labels={
        isDelete
          ? {
              confirm: t('confirm'),
              reason: t('reason'),
              reasonHelp: t('reasonHelp'),
              reasonRequired: t('reasonRequired'),
              typeToConfirm: (name) => t('typeToConfirm', { name }),
              typeMismatch: (name) => t('typeMismatch', { name }),
            }
          : { confirm: t('confirm') }
      }
      confirmationText={isDelete ? agent.name : undefined}
      error={error}
      onConfirm={async ({ reason }) => {
        // the consequences named above must be the ones at the moment of confirming: a confirm
        // that comes before they arrived waits for them
        const consequences = impact.data ?? (await impact.refetch()).data
        if (!consequences) throw new Error('The consequences could not be loaded')
        if (isDelete) {
          await remove.mutateAsync({ agentId: agent.id, confirmName: agent.name, reason })
        } else {
          await lifecycle.mutateAsync({ agentId: agent.id, action })
        }
        toast.success(t('done', { name: agent.name }))
      }}
    />
  )
}
