// SPDX-License-Identifier: AGPL-3.0-only
'use client'

import { useQuery } from '@tanstack/react-query'
import { useTranslations } from 'next-intl'

import { useMakePrimaryMutation, vaultQueries } from '@/api/vault'
import type { CredentialDto } from '@surefy/contracts'
import { toast } from '@surefy/ui/components/Feedback'
import { ConfirmDialog } from '@surefy/ui/components/Overlay'
import { getErrorMessage } from '@surefy/web-core/errors'

import { getImpactLines } from '../../ImpactLines'

/**
 * Rotation step 2 (T2): new requests use the replacement key. Calls already running finish on the
 * old key, which stays active until it is revoked.
 */
export default function SwitchTrafficDialog({
  orgId,
  credential,
  onClose,
}: Readonly<{ orgId: string; credential: CredentialDto; onClose: () => void }>) {
  const t = useTranslations('vault.switch')
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
      description={t('description')}
      impact={impact.data ? getImpactLines(tImpact, impact.data, { includeFallback: false }) : []}
      labels={{ confirm: t('confirm') }}
      error={error ? getErrorMessage(error, tErrors) : undefined}
      onConfirm={async () => {
        if (!impact.data) throw new Error('The impact is not loaded yet')
        await makePrimary.mutateAsync(credential.id)
        toast.success(t('switched', { name: credential.name }))
      }}
    />
  )
}
