// SPDX-License-Identifier: AGPL-3.0-only
'use client'

import { useQuery } from '@tanstack/react-query'
import { useTranslations } from 'next-intl'

import { useRemoveLocalServerMutation, vaultQueries } from '@/api/vault'
import type { CredentialDto } from '@surefy/contracts'
import { toast } from '@surefy/ui/components/Feedback'
import { ConfirmDialog } from '@surefy/ui/components/Overlay'
import { getErrorMessage } from '@surefy/web-core/errors'

import { getImpactLines } from '../../ImpactLines'

/**
 * Remove a local server (T2): its models go with it. The server refuses while one of its models is
 * the embedding model or backs a decision model, and the dialog shows that error.
 */
export default function RemoveServerDialog({
  orgId,
  server,
  onClose,
}: Readonly<{ orgId: string; server: CredentialDto; onClose: () => void }>) {
  const t = useTranslations('vault.removeServer')
  const tImpact = useTranslations('vault.impact')
  const tErrors = useTranslations('errors')
  const impact = useQuery(vaultQueries.localServerImpact(orgId, server.id))
  const remove = useRemoveLocalServerMutation(orgId, { silent: true })
  const error = remove.error ?? impact.error
  const lines = impact.data ? getImpactLines(tImpact, impact.data, { includeFallback: true }) : []

  return (
    <ConfirmDialog
      open
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
      tier="T2"
      tone="destructive"
      title={t('title', { name: server.name })}
      description={t('description', { count: server.modelCount ?? 0 })}
      impact={lines}
      labels={{ confirm: t('confirm') }}
      error={error ? getErrorMessage(error, tErrors) : undefined}
      onConfirm={async () => {
        if (!impact.data) throw new Error('The impact is not loaded yet')
        await remove.mutateAsync(server.id)
        toast.success(t('removed', { name: server.name }))
      }}
    />
  )
}
