// SPDX-License-Identifier: AGPL-3.0-only
'use client'

import { useEffect, useState } from 'react'

import {
  FileDropzone,
  FileUploadList,
  formatFileSize,
  type FileRejection,
  type FileUploadItem,
} from '@surefy/ui/components/Forms'
import { Section } from '@surefy/ui/components/Layout'

const MAX_SIZE = 50_000_000

/** Simulated uploads: progress, a failure on files named "fail…", retry and remove. */
export default function UploadDemo() {
  const [items, setItems] = useState<FileUploadItem[]>([
    { id: 'seed-1', name: 'pricing-2026.pdf', size: '1.2 MB', status: 'done' },
    {
      id: 'seed-2',
      name: 'handbook.docx',
      size: '8.4 MB',
      status: 'error',
      error: 'Upload stopped. Check your connection and try again',
    },
  ])

  useEffect(() => {
    const timer = globalThis.setInterval(() => {
      setItems((current) =>
        current.map((item) => {
          if (item.status !== 'uploading') return item
          const progress = (item.progress ?? 0) + 20
          if (progress < 100) return { ...item, progress }
          return item.name.startsWith('fail')
            ? { ...item, status: 'error', error: 'Upload failed. Try again' }
            : { ...item, status: 'done' }
        }),
      )
    }, 500)
    return () => {
      globalThis.clearInterval(timer)
    }
  }, [])

  const handleAccepted = (files: File[]) => {
    setItems((current) => [
      ...current,
      ...files.map((file) => ({
        id: crypto.randomUUID(),
        name: file.name,
        size: formatFileSize(file.size),
        status: 'uploading' as const,
        progress: 0,
      })),
    ])
  }
  const handleRejected = (rejections: FileRejection[]) => {
    setItems((current) => [
      ...current,
      ...rejections.map(({ file, reason }) => ({
        id: crypto.randomUUID(),
        name: file.name,
        size: formatFileSize(file.size),
        status: 'error' as const,
        error:
          reason === 'size'
            ? 'Larger than 50 MB. Split the file or compress it'
            : 'This type is not supported. Use PDF, DOCX, TXT or Markdown',
      })),
    ])
  }

  return (
    <Section title="File upload" description="Click or drop; per-file progress, errors and retry.">
      <FileDropzone
        labels={{
          title: 'Drop files here or browse',
          hint: 'PDF, DOCX, TXT or Markdown · up to 50 MB',
        }}
        accept={[
          'application/pdf',
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          'text/plain',
          '.md',
        ]}
        maxSize={MAX_SIZE}
        onFilesAccepted={handleAccepted}
        onFilesRejected={handleRejected}
      />
      <FileUploadList
        items={items}
        labels={{
          uploading: 'Uploading',
          done: 'Uploaded',
          retry: 'Retry',
          remove: (name) => `Remove ${name}`,
        }}
        isRetryable={(item) =>
          !item.error?.startsWith('This type') && !item.error?.startsWith('Larger')
        }
        onRetry={(id) => {
          setItems((current) =>
            current.map((item) =>
              item.id === id
                ? {
                    ...item,
                    name: item.name.replace(/^fail/, ''),
                    status: 'uploading',
                    progress: 0,
                  }
                : item,
            ),
          )
        }}
        onRemove={(id) => {
          setItems((current) => current.filter((item) => item.id !== id))
        }}
      />
    </Section>
  )
}
