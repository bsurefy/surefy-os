// SPDX-License-Identifier: AGPL-3.0-only
import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { useTranslations } from 'next-intl'
import { useState } from 'react'

import { knowledgeQueries, useDownloadKnowledgeDocumentMutation } from '@/api/knowledge'
import type { KnowledgeSourceDto } from '@surefy/contracts'
import { getErrorMessage, isApiError } from '@surefy/web-core/errors'

/** The Source preview: the source's documents, the open one's facts and its text by page. */
export function useSourcePreviewController(
  orgId: string,
  baseId: string,
  source: KnowledgeSourceDto,
) {
  const tErrors = useTranslations('errors')
  const [chosenId, setChosenId] = useState<string | null>(null)
  const documents = useInfiniteQuery(knowledgeQueries.documents(orgId, baseId, source.id, {}))
  const list = documents.data?.pages.flatMap((page) => page.items) ?? []
  const documentId = chosenId ?? list[0]?.id ?? ''
  const hasDocument = documentId !== ''
  const detail = useQuery({
    ...knowledgeQueries.document(orgId, baseId, documentId),
    enabled: hasDocument,
  })
  const pages = useInfiniteQuery({
    ...knowledgeQueries.documentPages(orgId, baseId, documentId),
    enabled: hasDocument && detail.data?.document.status === 'ready',
  })
  const download = useDownloadKnowledgeDocumentMutation(orgId, baseId)

  return {
    documents: list,
    isLoadingDocuments: documents.isPending,
    hasMoreDocuments: documents.hasNextPage,
    onLoadMoreDocuments: () => void documents.fetchNextPage(),
    documentId,
    onChooseDocument: setChosenId,
    detail: detail.data,
    isLoadingDetail: hasDocument && detail.isPending,
    errorMessage: detail.error ? getErrorMessage(detail.error, tErrors) : null,
    errorReference: isApiError(detail.error) ? detail.error.requestId : undefined,
    pages: pages.data?.pages.flatMap((page) => page.items) ?? [],
    isLoadingPages: pages.isPending && pages.fetchStatus !== 'idle',
    hasMorePages: pages.hasNextPage,
    isLoadingMorePages: pages.isFetchingNextPage,
    onLoadMorePages: () => void pages.fetchNextPage(),
    isDownloading: download.isPending,
    onDownload: () => {
      if (!documentId) return
      download.mutate(documentId, {
        onSuccess: (link) => {
          window.open(link.url, '_blank', 'noopener,noreferrer')
        },
      })
    },
  }
}
