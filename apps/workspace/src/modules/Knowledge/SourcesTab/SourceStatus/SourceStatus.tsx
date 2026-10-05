// SPDX-License-Identifier: AGPL-3.0-only
'use client'

import { useTranslations } from 'next-intl'

import type { KnowledgeSourceDto } from '@surefy/contracts'
import { StatusPill } from '@surefy/ui/components/DataDisplay'
import { ProgressBar } from '@surefy/ui/components/Feedback'

/** The status of a source: progress while it uploads or processes, a pill once it settles, and the reason when it failed. */
export default function SourceStatus({ source }: Readonly<{ source: KnowledgeSourceDto }>) {
  const t = useTranslations('knowledge.detail.sources.status')
  const tReasons = useTranslations('knowledge.detail.sources.reasons')

  if (source.status === 'uploading' || source.status === 'processing') {
    return (
      <ProgressBar
        label={t(source.status)}
        value={source.progressPercent}
        valueText={t('percent', { percent: source.progressPercent })}
      />
    )
  }
  const tone = {
    ready: 'success',
    queued: 'info',
    partially_failed: 'warning',
    paused: 'warning',
    failed: 'destructive',
  } as const
  const reason = source.errorCode ? tReasons(source.errorCode) : null
  return (
    <div className="flex flex-col items-start gap-1">
      <StatusPill tone={tone[source.status]} label={t(source.status)} />
      {source.status === 'partially_failed' && (
        <span className="text-caption text-muted-foreground">
          {t('failedDocuments', { count: source.failedDocumentCount })}
        </span>
      )}
      {reason && <span className="text-caption text-muted-foreground">{reason}</span>}
    </div>
  )
}
