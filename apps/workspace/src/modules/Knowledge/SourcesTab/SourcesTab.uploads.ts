// SPDX-License-Identifier: AGPL-3.0-only
import { useTranslations } from 'next-intl'
import { useRef, useState } from 'react'

import {
  sha256Hex,
  uploadToStorage,
  useCompleteKnowledgeFileUploadMutation,
  useDeleteKnowledgeSourceMutation,
  useRequestKnowledgeFileUploadMutation,
} from '@/api/knowledge'
import { ERROR_CODES, KNOWLEDGE_FILE_LIMITS } from '@surefy/contracts'
import type { KnowledgeDuplicateAction } from '@surefy/contracts'
import { formatFileSize } from '@surefy/ui/components/Forms'
import type { FileRejection } from '@surefy/ui/components/Forms'
import { getErrorMessage, isApiError } from '@surefy/web-core/errors'

import { getFileContentType } from './SourcesTab.utils'

export interface UploadItem {
  id: string
  file: File
  status: 'uploading' | 'error'
  /** 0–100 while uploading. */
  progress: number
  error?: string
  isRetryable: boolean
}

/** A file whose bytes are already in the base: the person chooses Replace, Keep both or skips it. */
export interface PendingDuplicate {
  itemId: string
  file: File
}

class UploadFailedError extends Error {}

/**
 * The upload queue of the Sources tab. Per file: SHA-256 in the browser, the upload request (a
 * duplicate answers 409 and waits for a choice), the bytes to signed storage with progress, then
 * `complete`. A file that never reached storage has its source removed again so Retry starts clean.
 */
export function useKnowledgeUploads(orgId: string, baseId: string) {
  const t = useTranslations('knowledge.detail.sources.upload')
  const tErrors = useTranslations('errors')
  const request = useRequestKnowledgeFileUploadMutation(orgId, baseId, { silent: true })
  const complete = useCompleteKnowledgeFileUploadMutation(orgId, baseId, { silent: true })
  const deleteSource = useDeleteKnowledgeSourceMutation(orgId, baseId, { silent: true })
  const [items, setItems] = useState<UploadItem[]>([])
  const [duplicates, setDuplicates] = useState<PendingDuplicate[]>([])
  const [isQuotaReached, setIsQuotaReached] = useState(false)
  const counter = useRef(0)

  const patch = (id: string, changes: Partial<UploadItem>) => {
    setItems((current) => current.map((item) => (item.id === id ? { ...item, ...changes } : item)))
  }
  const remove = (id: string) => {
    setItems((current) => current.filter((item) => item.id !== id))
  }

  const send = async (item: UploadItem, duplicate: KnowledgeDuplicateAction) => {
    patch(item.id, { status: 'uploading', progress: 0, error: undefined })
    try {
      const contentType = getFileContentType(item.file)
      if (!contentType) throw new UploadFailedError(t('unsupported'))
      const sha256 = await sha256Hex(item.file)
      const created = await request.mutateAsync({
        fileName: item.file.name,
        contentType,
        sizeBytes: item.file.size,
        sha256,
        ocrMode: 'auto',
        duplicate,
      })
      try {
        await uploadToStorage(created.upload, item.file, (progress) => {
          patch(item.id, { progress })
        })
      } catch {
        // The bytes never arrived: drop the half-made source so Retry starts clean
        try {
          await deleteSource.mutateAsync(created.source.id)
        } catch {
          // Best effort: the API purges sources that never completed
        }
        throw new UploadFailedError(t('failed'))
      }
      await complete.mutateAsync(created.source.id)
      remove(item.id)
    } catch (error) {
      if (isApiError(error) && error.code === ERROR_CODES.KNOWLEDGE_DUPLICATE_FILE) {
        setDuplicates((current) => [...current, { itemId: item.id, file: item.file }])
        remove(item.id)
        return
      }
      if (isApiError(error) && error.code === ERROR_CODES.LIMIT_REACHED) setIsQuotaReached(true)
      patch(item.id, {
        status: 'error',
        error: error instanceof UploadFailedError ? error.message : getErrorMessage(error, tErrors),
        isRetryable: !(isApiError(error) && error.code === ERROR_CODES.KNOWLEDGE_FILE_UNSUPPORTED),
      })
    }
  }

  const start = (file: File, duplicate: KnowledgeDuplicateAction = 'reject') => {
    counter.current += 1
    const item: UploadItem = {
      id: `upload-${counter.current}`,
      file,
      status: 'uploading',
      progress: 0,
      isRetryable: true,
    }
    setItems((current) => [...current, item])
    void send(item, duplicate)
  }

  return {
    items,
    duplicates,
    isQuotaReached,
    onFilesAccepted: (files: File[]) => {
      for (const file of files) start(file)
    },
    /** Files the dropzone refused (type or size) are listed with what to do about it. */
    onFilesRejected: (rejections: FileRejection[]) => {
      for (const { file, reason } of rejections) {
        counter.current += 1
        setItems((current) => [
          ...current,
          {
            id: `upload-${counter.current}`,
            file,
            status: 'error',
            progress: 0,
            isRetryable: false,
            error:
              reason === 'size'
                ? t('tooLarge', { limit: formatFileSize(KNOWLEDGE_FILE_LIMITS.maxBytes) })
                : t('unsupported'),
          },
        ])
      }
    },
    onRetry: (id: string) => {
      const item = items.find((candidate) => candidate.id === id)
      if (item) void send(item, 'reject')
    },
    onRemove: remove,
    /** Resolves the first waiting duplicate: replace the old source, keep both, or skip the file. */
    onResolveDuplicate: (choice: KnowledgeDuplicateAction | 'skip') => {
      const [first, ...rest] = duplicates
      if (!first) return
      setDuplicates(rest)
      if (choice !== 'skip') start(first.file, choice)
    },
    onDismissQuota: () => {
      setIsQuotaReached(false)
    },
  }
}
export type KnowledgeUploads = ReturnType<typeof useKnowledgeUploads>
