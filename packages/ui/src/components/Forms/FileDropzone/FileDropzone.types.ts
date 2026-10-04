// SPDX-License-Identifier: AGPL-3.0-only
export interface FileRejection {
  file: File
  /** `type`: not an accepted type; `size`: larger than `maxSize`. */
  reason: 'type' | 'size'
}

export interface FileDropzoneLabels {
  /** "Drop files here or browse". */
  title: string
  /** Accepted types and size: "PDF, DOCX or TXT · up to 50 MB". */
  hint: string
}

export interface FileDropzoneProps {
  labels: FileDropzoneLabels
  /** MIME types (`application/pdf`, `image/*`) or extensions (`.md`). Any type when omitted. */
  accept?: string[]
  /** Largest file in bytes. */
  maxSize?: number
  /** Default true. */
  isMultiple?: boolean
  isDisabled?: boolean
  /** Files that passed the type and size checks. */
  onFilesAccepted: (files: File[]) => void
  /** Files that did not; show each one's error in the upload list. */
  onFilesRejected?: (rejections: FileRejection[]) => void
  /** Set by `Field`; goes to the file input. */
  id?: string
  'aria-describedby'?: string
  'aria-invalid'?: boolean
  className?: string
}
