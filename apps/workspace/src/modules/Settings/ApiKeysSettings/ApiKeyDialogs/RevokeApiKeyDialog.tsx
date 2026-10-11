// SPDX-License-Identifier: AGPL-3.0-only
'use client'

import { useQuery } from '@tanstack/react-query'
import { useTranslations } from 'next-intl'

import { apiKeyQueries, useRevokeApiKeyMutation } from '@/api/apiKeys'
import type { ApiKeyDto } from '@surefy/contracts'
import { toast } from '@surefy/ui/components/Feedback'
import { ConfirmDialog } from '@surefy/ui/components/Overlay'
import { Button } from '@surefy/ui/primitives/button'
import { getErrorMessage } from '@surefy/web-core/errors'

import { getRevokeImpact } from '../ApiKeysSettings.utils'

import type { ReactNode } from 'react'

/**
 * Revoke a key (T2): names the agents published over the API that stop answering, says the calls
 * fail at once and that it cannot be undone, and suggests rotating when other keys exist.
 */
export default function RevokeApiKeyDialog({
  orgId,
  apiKey,
  hasOtherActiveKeys,
  onClose,
}: Readonly<{
  orgId: string
  apiKey: ApiKeyDto
  hasOtherActiveKeys: boolean
  onClose: () => void
}>) {
  const t = useTranslations('settings.apiKeys.revoke')
  const tErrors = useTranslations('errors')
  const impact = useQuery(apiKeyQueries.impact(orgId, apiKey.id))
  const revoke = useRevokeApiKeyMutation(orgId, { silent: true })

  const summary = impact.data ? getRevokeImpact(impact.data) : null
  const isUnused = summary !== null && summary.agentCount === 0 && summary.others.length === 0
  const lines: ReactNode[] = []
  if (summary) {
    const { agentCount, agentNames, moreAgents, others } = summary
    if (agentCount > 0) {
      lines.push(
        t('agents', {
          count: agentCount,
          names: agentNames.join(', '),
          more: moreAgents,
        }),
      )
    }
    for (const other of others) {
      lines.push(
        t.has(`types.${other.type}`)
          ? t(`types.${other.type}`, { count: other.count })
          : t('types.other', { type: other.type, count: other.count }),
      )
    }
    lines.push(t('immediate'))
    if (hasOtherActiveKeys) lines.push(t('rotate'))
  }

  let error: ReactNode
  if (impact.error) {
    error = (
      <span className="flex flex-wrap items-center gap-2">
        {t('impactUnavailable')}
        <Button
          variant="link"
          size="sm"
          onClick={() => {
            void impact.refetch()
          }}
        >
          {t('retry')}
        </Button>
      </span>
    )
  } else if (revoke.error) {
    error = getErrorMessage(revoke.error, tErrors)
  }

  return (
    <ConfirmDialog
      open
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
      tier="T2"
      tone="destructive"
      title={t('title', { name: apiKey.name })}
      description={isUnused ? t('unused') : t('description')}
      impact={lines}
      labels={{ confirm: t('confirm') }}
      error={error}
      confirmDisabled={!impact.data}
      onConfirm={async () => {
        // the names must be the ones at the moment of confirming
        if (!impact.data) throw new Error('The impact is not loaded yet')
        await revoke.mutateAsync(apiKey.id)
        toast.success(t('revoked', { name: apiKey.name }))
      }}
    />
  )
}
