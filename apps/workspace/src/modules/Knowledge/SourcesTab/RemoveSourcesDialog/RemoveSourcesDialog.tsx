// SPDX-License-Identifier: AGPL-3.0-only
'use client'

import { useTranslations } from 'next-intl'

import { useBulkKnowledgeSourcesMutation } from '@/api/knowledge'
import type { KnowledgeSourceDto } from '@surefy/contracts'
import { toast } from '@surefy/ui/components/Feedback'
import { ConfirmDialog } from '@surefy/ui/components/Overlay'
import { getErrorMessage } from '@surefy/web-core/errors'

/**
 * Remove one or more sources (T2): "Agents won't find this anymore. You can restore it for 30
 * days." They move to Recently deleted and free their storage at once.
 */
export default function RemoveSourcesDialog({
  orgId,
  baseId,
  sources,
  onClose,
  onRemoved,
}: Readonly<{
  orgId: string
  baseId: string
  sources: readonly KnowledgeSourceDto[]
  onClose: () => void
  onRemoved: () => void
}>) {
  const t = useTranslations('knowledge.detail.sources.remove')
  const tErrors = useTranslations('errors')
  const bulk = useBulkKnowledgeSourcesMutation(orgId, baseId, { silent: true })
  const [first] = sources

  return (
    <ConfirmDialog
      open
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
      tier="T2"
      tone="destructive"
      title={
        sources.length === 1 && first
          ? t('titleOne', { name: first.name })
          : t('titleMany', { count: sources.length })
      }
      description={t('description')}
      labels={{ confirm: t('confirm') }}
      error={bulk.error ? getErrorMessage(bulk.error, tErrors) : undefined}
      onConfirm={async () => {
        await bulk.mutateAsync({ action: 'remove', sourceIds: sources.map(({ id }) => id) })
        toast.success(t('removed', { count: sources.length }))
        onRemoved()
      }}
    />
  )
}
