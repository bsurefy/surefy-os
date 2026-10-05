// SPDX-License-Identifier: AGPL-3.0-only
import { useQuery } from '@tanstack/react-query'
import { useTranslations } from 'next-intl'
import { useState } from 'react'

import {
  dataControlQueries,
  useCreateExportMutation,
  useDownloadExportMutation,
  useRetryExportMutation,
} from '@/api/dataControl'

import { toExportParams } from '../InsightsOverview.utils'

import type { InsightsQuery } from '@/api/usage'

/** Export what is on screen as `usage_csv`: start, follow it to Ready, download. */
export function useInsightsExportController(orgId: string, query: InsightsQuery) {
  const t = useTranslations('insights.overview.export')
  const [exportId, setExportId] = useState<string | null>(null)
  const create = useCreateExportMutation(orgId)
  const retry = useRetryExportMutation(orgId)
  const download = useDownloadExportMutation(orgId)
  const { data: current } = useQuery({
    ...dataControlQueries.export(orgId, exportId ?? ''),
    enabled: exportId !== null,
  })

  return {
    current: exportId ? current : undefined,
    isStarting: create.isPending,
    onStart: () => {
      create.mutate(
        { kind: 'usage_csv', params: toExportParams(query) },
        {
          onSuccess: (created) => {
            setExportId(created.id)
          },
        },
      )
    },
    isRetrying: retry.isPending,
    onRetry: () => {
      if (exportId) retry.mutate(exportId)
    },
    isDownloading: download.isPending,
    onDownload: () => {
      if (!exportId) return
      download.mutate(exportId, {
        onSuccess: (link) => {
          window.open(link.url, '_blank', 'noopener,noreferrer')
        },
      })
    },
    t,
  }
}
