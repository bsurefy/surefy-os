// SPDX-License-Identifier: AGPL-3.0-only
export interface FileUploadItem {
  id: string
  name: string
  /** Formatted size ("4.2 MB"), see `formatFileSize`. */
  size: string
  status: 'uploading' | 'done' | 'error'
  /** 0–100 while uploading. */
  progress?: number
  /** Translated error: what went wrong and what to do ("Larger than 50 MB. Split the file"). */
  error?: string
}

export interface FileUploadListLabels {
  /** "Uploading". */
  uploading: string
  /** "Uploaded". */
  done: string
  retry: string
  /** (name) => "Remove report.pdf". */
  remove: (name: string) => string
}

export interface FileUploadListProps {
  items: FileUploadItem[]
  labels: FileUploadListLabels
  /** Shown on items with an error, unless the error cannot be retried (`isRetryable`). */
  onRetry?: (id: string) => void
  isRetryable?: (item: FileUploadItem) => boolean
  onRemove: (id: string) => void
  className?: string
}
