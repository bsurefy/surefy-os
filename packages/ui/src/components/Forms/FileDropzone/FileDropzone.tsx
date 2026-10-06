// SPDX-License-Identifier: AGPL-3.0-only
'use client'

import { Upload } from 'lucide-react'
import { useId, useState, type DragEvent } from 'react'

import { checkFiles } from './checkFiles'
import { cn } from '../../../lib/utils'

import type { FileDropzoneProps } from './FileDropzone.types'

/**
 * Click or drop files. Shows the accepted types and size; checks both and hands back accepted files
 * and rejections. Progress, per-file errors and retry are shown by `FileUploadList`.
 */
export default function FileDropzone({
  labels,
  accept,
  maxSize,
  isMultiple = true,
  isDisabled = false,
  onFilesAccepted,
  onFilesRejected,
  id,
  className,
  ...aria
}: Readonly<FileDropzoneProps>) {
  const generatedId = useId()
  const inputId = id ?? generatedId
  const titleId = `${inputId}-title`
  const hintId = `${inputId}-hint`
  const [isDragging, setIsDragging] = useState(false)

  const handleFiles = (list: FileList | null) => {
    if (!list || isDisabled) return
    const files = isMultiple ? [...list] : [...list].slice(0, 1)
    const { accepted, rejected } = checkFiles(files, accept, maxSize)
    if (accepted.length) onFilesAccepted(accepted)
    if (rejected.length) onFilesRejected?.(rejected)
  }
  const handleDrag = (event: DragEvent<HTMLLabelElement>, isOver: boolean) => {
    event.preventDefault()
    if (!isDisabled) setIsDragging(isOver)
  }

  return (
    <div className={className}>
      <input
        id={inputId}
        type="file"
        className="peer sr-only"
        accept={accept?.join(',')}
        multiple={isMultiple}
        disabled={isDisabled}
        aria-labelledby={titleId}
        {...aria}
        aria-describedby={[hintId, aria['aria-describedby']].filter(Boolean).join(' ')}
        onChange={(event) => {
          handleFiles(event.target.files)
          // Lets the same file be picked again after a failed upload.
          event.target.value = ''
        }}
      />
      <label
        htmlFor={inputId}
        data-dragging={isDragging || undefined}
        className={cn(
          'border-input bg-surface hover:bg-surface-2 data-dragging:border-primary data-dragging:bg-primary-soft peer-focus-visible:outline-ring peer-aria-invalid:border-destructive flex cursor-pointer flex-col items-center gap-2.5 rounded-xl border-[1.5px] border-dashed px-6 py-6 text-center transition-colors peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-solid peer-disabled:cursor-not-allowed peer-disabled:opacity-50',
        )}
        onDragEnter={(event) => {
          handleDrag(event, true)
        }}
        onDragOver={(event) => {
          handleDrag(event, true)
        }}
        onDragLeave={(event) => {
          handleDrag(event, false)
        }}
        onDrop={(event) => {
          handleDrag(event, false)
          handleFiles(event.dataTransfer.files)
        }}
      >
        <span className="bg-surface border-border text-primary flex size-11 items-center justify-center rounded-xl border">
          <Upload aria-hidden className="size-5" />
        </span>
        <span className="flex flex-col gap-0.5">
          <span id={titleId} className="text-section-title text-foreground">
            {labels.title}
          </span>
          <span id={hintId} className="text-label text-foreground-secondary font-normal">
            {labels.hint}
          </span>
        </span>
        {labels.browse && (
          <span
            aria-hidden="true"
            className="bg-primary text-primary-foreground text-label inline-flex h-8 items-center rounded-lg px-3.5"
          >
            {labels.browse}
          </span>
        )}
      </label>
    </div>
  )
}
