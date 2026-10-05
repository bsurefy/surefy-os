// SPDX-License-Identifier: AGPL-3.0-only
import { KNOWLEDGE_FILE_TYPES } from '@surefy/contracts'
import type { KnowledgeFileType } from '@surefy/contracts'

/** The status filter of the Sources table; one status at a time (list filters are single-valued). */
export const SOURCE_STATUS_FILTERS = [
  'all',
  'ready',
  'processing',
  'queued',
  'failed',
  'partially_failed',
  'paused',
] as const
export type SourceStatusFilter = (typeof SOURCE_STATUS_FILTERS)[number]

export const SOURCE_SORTS = [
  '-createdAt',
  'createdAt',
  'name',
  '-name',
  'sizeBytes',
  '-sizeBytes',
] as const
export type SourceSort = (typeof SOURCE_SORTS)[number]

/** Extensions browsers often report with an empty or generic type. */
const EXTENSION_TYPES: Readonly<Record<string, KnowledgeFileType>> = {
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  csv: 'text/csv',
  txt: 'text/plain',
  md: 'text/markdown',
  markdown: 'text/markdown',
  html: 'text/html',
  htm: 'text/html',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  tif: 'image/tiff',
  tiff: 'image/tiff',
}

/** What the dropzone accepts: the contract's types and their extensions. */
export const ACCEPTED_FILES: string[] = [
  ...KNOWLEDGE_FILE_TYPES,
  ...Object.keys(EXTENSION_TYPES).map((extension) => `.${extension}`),
]

export { EXTENSION_TYPES }

/** Types that "Retry with OCR" can help: scans and images. */
export const OCR_TYPES: readonly string[] = [
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/tiff',
]
