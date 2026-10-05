// SPDX-License-Identifier: AGPL-3.0-only
'use client'

import { useQuery } from '@tanstack/react-query'
import { useTranslations } from 'next-intl'

import { useRevokeCredentialMutation, vaultQueries } from '@/api/vault'
import type { CredentialDto } from '@surefy/contracts'
import { toast } from '@surefy/ui/components/Feedback'
import { ConfirmDialog } from '@surefy/ui/components/Overlay'
import { getErrorMessage } from '@surefy/web-core/errors'

import { getImpactLines } from '../../ImpactLines'

/**
 * Revoke a key (T2): lists the agents, flows and people that use it and the model each falls back
 * to ("3 agents will fall back to Llama 3.1 70B"). The secret is deleted and cannot be restored.
 */
export default function RevokeKeyDialog({
  orgId,
  credential,
  onClose,
}: Readonly<{ orgId: string; credential: CredentialDto; onClose: () => void }>) {
  const t = useTranslations('vault.revoke')
  const tImpact = useTranslations('vault.impact')
  const tErrors = useTranslations('errors')
  const impact = useQuery(vaultQueries.credentialImpact(orgId, credential.id, 'revoke'))
  const revoke = useRevokeCredentialMutation(orgId, { silent: true })
  const error = revoke.error ?? impact.error

  return (
    <ConfirmDialog
      open
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
      tier="T2"
      tone="destructive"
      title={t('title', { name: credential.name })}
      description={t('description')}
      impact={impact.data ? getImpactLines(tImpact, impact.data, { includeFallback: true }) : []}
      labels={{ confirm: t('confirm') }}
      error={error ? getErrorMessage(error, tErrors) : undefined}
      onConfirm={async () => {
        if (!impact.data) throw new Error('The impact is not loaded yet')
        await revoke.mutateAsync(credential.id)
        toast.success(t('revoked', { name: credential.name }))
      }}
    />
  )
}
