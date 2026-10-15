// SPDX-License-Identifier: AGPL-3.0-only
'use client'

import { useQuery } from '@tanstack/react-query'
import { useTranslations } from 'next-intl'

import { useMakePrimaryMutation, useRevokeCredentialMutation, vaultQueries } from '@/api/vault'
import type { CredentialDto } from '@surefy/contracts'
import { toast } from '@surefy/ui/components/Feedback'
import { ConfirmDialog } from '@surefy/ui/components/Overlay'
import { getErrorMessage } from '@surefy/web-core/errors'

import { getImpactLines } from '../../ImpactLines'
import { getProviderName } from '../../Vault.utils'

interface SearchProviderDialogProps {
  orgId: string
  credential: CredentialDto
  onClose: () => void
}

/**
 * Use this search provider (T2): from now on every web search of the organization goes to it, and
 * the queries reach a different company. Searches already running finish on the old one.
 */
export function SwitchSearchProviderDialog({
  orgId,
  credential,
  onClose,
}: Readonly<SearchProviderDialogProps>) {
  const t = useTranslations('vault.searchProviders.switch')
  const tImpact = useTranslations('vault.impact')
  const tErrors = useTranslations('errors')
  const impact = useQuery(vaultQueries.credentialImpact(orgId, credential.id, 'switch'))
  const makePrimary = useMakePrimaryMutation(orgId, { silent: true })
  const error = makePrimary.error ?? impact.error

  return (
    <ConfirmDialog
      open
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
      tier="T2"
      title={t('title', { name: credential.name })}
      description={t('description', { provider: getProviderName(credential.providerKey) })}
      impact={impact.data ? getImpactLines(tImpact, impact.data, { includeFallback: false }) : []}
      labels={{ confirm: t('confirm') }}
      error={error ? getErrorMessage(error, tErrors) : undefined}
      confirmDisabled={!impact.data}
      onConfirm={async () => {
        if (!impact.data) throw new Error('The impact is not loaded yet')
        await makePrimary.mutateAsync(credential.id)
        toast.success(t('switched', { name: credential.name }))
      }}
    />
  )
}

/**
 * Revoke a search provider (T2): the agents that search the web, and Chat, lose web search until
 * another provider is primary. There is no fallback model to name.
 */
export function RevokeSearchProviderDialog({
  orgId,
  credential,
  onClose,
}: Readonly<SearchProviderDialogProps>) {
  const t = useTranslations('vault.searchProviders.revoke')
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
      description={credential.isPrimary ? t('descriptionPrimary') : t('description')}
      impact={impact.data ? getImpactLines(tImpact, impact.data, { includeFallback: false }) : []}
      labels={{ confirm: t('confirm') }}
      error={error ? getErrorMessage(error, tErrors) : undefined}
      confirmDisabled={!impact.data}
      onConfirm={async () => {
        if (!impact.data) throw new Error('The impact is not loaded yet')
        await revoke.mutateAsync(credential.id)
        toast.success(t('revoked', { name: credential.name }))
      }}
    />
  )
}
