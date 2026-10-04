// SPDX-License-Identifier: AGPL-3.0-only
'use client'

import { useQuery } from '@tanstack/react-query'
import { useTranslations } from 'next-intl'

import { modelQueries, useSetModelAccessMutation } from '@/api/models'
import type { ModelAccessEntryDto, SetModelAccessInput } from '@surefy/contracts'
import { toast } from '@surefy/ui/components/Feedback'
import { ConfirmDialog } from '@surefy/ui/components/Overlay'
import { getErrorMessage } from '@surefy/web-core/errors'

import { getImpactLines } from '../ImpactLines'

export interface RemoveAccessRequest {
  entry: ModelAccessEntryDto
  /** The rules the model keeps after the removal. */
  rules: SetModelAccessInput['rules']
  /** The team losing access, when the change removes one team's rule. */
  teamId?: string
  /** Who loses access, for the title ("Support", "Everyone"). */
  subjectName: string
}

/**
 * Remove access to a model (T2): lists the agents, flows and people affected. Used when a team or
 * person is taken off a model, in the list and in the matrix.
 */
export default function RemoveAccessDialog({
  orgId,
  request,
  onClose,
}: Readonly<{ orgId: string; request: RemoveAccessRequest; onClose: () => void }>) {
  const t = useTranslations('vault.removeAccess')
  const tImpact = useTranslations('vault.impact')
  const tErrors = useTranslations('errors')
  const impact = useQuery(
    modelQueries.impact(orgId, request.entry.modelId, 'remove-access', request.teamId),
  )
  const setAccess = useSetModelAccessMutation(orgId, { silent: true })
  const error = setAccess.error ?? impact.error
  const lines = impact.data ? getImpactLines(tImpact, impact.data, { includeFallback: true }) : []

  return (
    <ConfirmDialog
      open
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
      tier="T2"
      tone="destructive"
      title={t('title', { subject: request.subjectName, model: request.entry.displayName })}
      description={impact.data && lines.length === 0 ? t('unused') : t('description')}
      impact={lines}
      labels={{ confirm: t('confirm') }}
      error={error ? getErrorMessage(error, tErrors) : undefined}
      onConfirm={async () => {
        if (!impact.data) throw new Error('The impact is not loaded yet')
        await setAccess.mutateAsync({ modelId: request.entry.modelId, rules: request.rules })
        toast.success(
          t('removed', { subject: request.subjectName, model: request.entry.displayName }),
        )
      }}
    />
  )
}
