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

import { CHAT_EXPORT_KIND } from '../ChatList.constants'

import type { ChatExportFormat } from '../ChatList.constants'

/** Export one chat: pick a format, start, follow it to Ready, download. */
export function useChatExportController(orgId: string, chatId: string) {
  const t = useTranslations('chat.list.export')
  const [format, setFormat] = useState<ChatExportFormat>('pdf')
  const [exportId, setExportId] = useState<string | null>(null)
  const create = useCreateExportMutation(orgId)
  const retry = useRetryExportMutation(orgId)
  const download = useDownloadExportMutation(orgId)
  const { data: current } = useQuery({
    ...dataControlQueries.export(orgId, exportId ?? ''),
    enabled: exportId !== null,
  })

  return {
    t,
    format,
    onFormatChange: setFormat,
    current: exportId ? current : undefined,
    isStarting: create.isPending,
    onStart: () => {
      create.mutate(
        { kind: CHAT_EXPORT_KIND[format], params: { version: 1, format, chatId, filters: {} } },
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
  }
}
