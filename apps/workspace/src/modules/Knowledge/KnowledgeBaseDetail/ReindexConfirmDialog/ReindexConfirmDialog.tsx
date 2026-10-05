// SPDX-License-Identifier: AGPL-3.0-only
'use client'

import { useQuery } from '@tanstack/react-query'
import { useTranslations } from 'next-intl'

import { knowledgeQueries } from '@/api/knowledge'
import { ConfirmDialog } from '@surefy/ui/components/Overlay'
import { getErrorMessage } from '@surefy/web-core/errors'

export type ReindexKind = 'reindex' | 'model' | 'preset'

/**
 * T2 for everything that re-indexes a base: "Re-index all", another embedding model, another
 * chunking preset. Names the passages and the time ("about 20 minutes"); search stays available
 * meanwhile, on the old index.
 */
export default function ReindexConfirmDialog({
  orgId,
  baseId,
  kind,
  modelKey,
  onConfirm,
  onClose,
}: Readonly<{
  orgId: string
  baseId: string
  kind: ReindexKind
  /** The target model of a model change. */
  modelKey?: string
  onConfirm: () => Promise<unknown>
  onClose: () => void
}>) {
  const t = useTranslations('knowledge.detail.reindex')
  const tErrors = useTranslations('errors')
  const impact = useQuery(knowledgeQueries.reindexImpact(orgId, baseId, modelKey))

  return (
    <ConfirmDialog
      open
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
      tier="T2"
      title={t(`${kind}.title`)}
      description={
        impact.data
          ? t('description', {
              count: impact.data.chunkCount,
              minutes: impact.data.estimatedMinutes,
            })
          : t('loadingDescription')
      }
      impact={[t('stillSearchable')]}
      labels={{ confirm: t(`${kind}.confirm`) }}
      error={impact.error ? getErrorMessage(impact.error, tErrors) : undefined}
      onConfirm={async () => {
        if (!impact.data) throw new Error('The impact is not loaded yet')
        await onConfirm()
        onClose()
      }}
    />
  )
}
