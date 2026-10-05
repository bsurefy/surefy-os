// SPDX-License-Identifier: AGPL-3.0-only
'use no memo'

import { useState } from 'react'

import { useChatAttachmentMutations } from '@/api/chats'
import { uploadToStorage } from '@/api/knowledge'
import { CHAT_ATTACHMENT_ERROR_CODES, ERROR_CODES } from '@surefy/contracts'
import { isApiError } from '@surefy/web-core/errors'

import { getAttachmentKind, validateAttachment } from '../ChatThread.utils'

import type { AttachmentChip, PendingAttachment } from '../ChatThread.types'

function ignore(): void {
  return
}

const UPLOAD_FAILED = ERROR_CODES.CHAT_ATTACHMENT_UPLOAD_FAILED

const failureCode = (error: unknown): string => {
  const code = isApiError(error) ? error.code : UPLOAD_FAILED
  return (CHAT_ATTACHMENT_ERROR_CODES as readonly string[]).includes(code) ? code : UPLOAD_FAILED
}

/**
 * The files on their way to the next message: each is checked, asked for an upload URL, sent to
 * storage with progress and completed. A failed file shows its reason and Retry; the others, and
 * sending without it, are not affected.
 */
export function useAttachments(orgId: string, chatId: string) {
  const api = useChatAttachmentMutations(orgId, chatId)
  const [items, setItems] = useState<PendingAttachment[]>([])

  const patch = (key: string, changes: Partial<PendingAttachment>) => {
    setItems((current) =>
      current.map((item) => (item.key === key ? { ...item, ...changes } : item)),
    )
  }

  const transfer = async (
    item: PendingAttachment,
    upload: Awaited<ReturnType<typeof api.requestUpload>>,
  ) => {
    patch(item.key, { id: upload.attachment.id, status: 'uploading', errorCode: null })
    try {
      await uploadToStorage(upload.upload, item.file, (progress) => {
        patch(item.key, { progress })
      })
      await api.complete(upload.attachment.id)
      patch(item.key, { status: 'ready', progress: 100 })
    } catch (error) {
      patch(item.key, { status: 'failed', errorCode: failureCode(error) })
    }
  }

  const start = async (item: PendingAttachment) => {
    try {
      await transfer(
        item,
        await api.requestUpload({
          fileName: item.name,
          contentType: item.mediaType as 'image/png',
          sizeBytes: item.file.size,
        }),
      )
    } catch (error) {
      patch(item.key, { status: 'failed', errorCode: failureCode(error) })
    }
  }

  return {
    items,
    hasUnfinished: items.some((item) => item.status === 'uploading'),
    readyChips: items
      .filter(
        (item): item is PendingAttachment & { id: string } =>
          item.status === 'ready' && item.id !== null,
      )
      .map((item): AttachmentChip => ({ id: item.id, name: item.name, mediaType: item.mediaType })),
    hasImages: items.some((item) => item.status !== 'failed' && item.kind === 'image'),
    add: (files: readonly File[]) => {
      for (const file of files) {
        const item: PendingAttachment = {
          key: crypto.randomUUID(),
          id: null,
          file,
          name: file.name,
          mediaType: file.type,
          kind: getAttachmentKind(file.type),
          status: 'uploading',
          progress: 0,
          errorCode: null,
        }
        const invalid = validateAttachment(file)
        if (invalid) {
          setItems((current) => [...current, { ...item, status: 'failed', errorCode: invalid }])
        } else {
          setItems((current) => [...current, item])
          void start(item)
        }
      }
    },
    retry: (key: string) => {
      const item = items.find((candidate) => candidate.key === key)
      if (!item) return
      patch(key, { status: 'uploading', progress: 0, errorCode: null })
      if (item.id)
        void api
          .retry(item.id)
          .then((upload) => transfer(item, upload))
          .catch((error: unknown) => {
            patch(key, { status: 'failed', errorCode: failureCode(error) })
          })
      else void start(item)
    },
    remove: (key: string) => {
      const item = items.find((candidate) => candidate.key === key)
      setItems((current) => current.filter((candidate) => candidate.key !== key))
      if (item?.id) void api.remove(item.id).catch(ignore)
    },
    clear: () => {
      setItems([])
    },
  }
}
export type Attachments = ReturnType<typeof useAttachments>
