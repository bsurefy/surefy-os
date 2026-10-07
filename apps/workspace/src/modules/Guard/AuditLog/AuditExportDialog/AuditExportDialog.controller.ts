// SPDX-License-Identifier: AGPL-3.0-only
import { useQuery } from '@tanstack/react-query'
import { useNow, useTimeZone, useTranslations } from 'next-intl'
import { useState } from 'react'

import {
  dataControlQueries,
  useCreateExportMutation,
  useDownloadExportMutation,
  useRetryExportMutation,
} from '@/api/dataControl'

import { toExportParams } from '../AuditLog.utils'

import type { AuditExportFormat } from '../AuditLog.constants'
import type { AuditLogFilters } from '../AuditLog.types'

const EXPORT_KIND = { csv: 'audit_csv', json: 'audit_json' } as const

/** Export the log as filtered: pick a format, start, follow it to Ready, download. */
export function useAuditExportController(orgId: string, filters: AuditLogFilters) {
  const t = useTranslations('guard.auditLog.export')
  const now = useNow()
  const timeZone = useTimeZone() ?? 'UTC'
  const [format, setFormat] = useState<AuditExportFormat>('csv')
  const [exportId, setExportId] = useState<string | null>(null)
  const create = useCreateExportMutation(orgId)
  const retry = useRetryExportMutation(orgId)
  const download = useDownloadExportMutation(orgId)
  const { data: current } = useQuery({
    ...dataControlQueries.export(orgId, exportId ?? ''),
    enabled: exportId !== null,
  })

  return {
    format,
    onFormatChange: setFormat,
    current: exportId ? current : undefined,
    isStarting: create.isPending,
    onStart: () => {
      create.mutate(
        {
          kind: EXPORT_KIND[format],
          params: toExportParams(filters, format, now, timeZone),
        },
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
