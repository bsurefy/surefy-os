// SPDX-License-Identifier: AGPL-3.0-only
import { ERROR_CODES, KNOWLEDGE_FILE_TYPES } from '@surefy/contracts'
import type {
  KnowledgeConnectorConfig,
  KnowledgeFileType,
  KnowledgeSourceDto,
} from '@surefy/contracts'

import { CONNECTOR_TILES, EXTENSION_TYPES, OCR_TYPES, SOURCE_SORTS } from './SourcesTab.constants'

import type { SourceSort, SourceStatusFilter } from './SourcesTab.constants'

/**
 * The knowledge file type of a picked file: the browser's type when it is one we accept, else the
 * one its extension names (Markdown and CSV often arrive with an empty type); null when neither.
 */
export function getFileContentType(file: Pick<File, 'name' | 'type'>): KnowledgeFileType | null {
  const byType = KNOWLEDGE_FILE_TYPES.find((type) => type === file.type)
  if (byType) return byType
  const extension = file.name.split('.').pop()?.toLowerCase() ?? ''
  return Object.hasOwn(EXTENSION_TYPES, extension) ? (EXTENSION_TYPES[extension] ?? null) : null
}

/** The status filter as the query value; "all" asks for every status. */
export function toStatusParam(filter: SourceStatusFilter): string | undefined {
  return filter === 'all' ? undefined : filter
}

/** The table sort for a column and direction; anything else is newest first. */
export function toSourceSort(id: string, isDescending: boolean): SourceSort {
  const wanted = isDescending ? `-${id}` : id
  return SOURCE_SORTS.find((value) => value === wanted) ?? '-createdAt'
}

/** "Retry with OCR" is offered for scans and images that failed or partly failed. */
export function canRetryWithOcr(
  source: Pick<KnowledgeSourceDto, 'type' | 'status' | 'contentType'>,
): boolean {
  return (
    source.type === 'file' &&
    (source.status === 'failed' || source.status === 'partially_failed') &&
    OCR_TYPES.includes(source.contentType ?? '')
  )
}

const KIND_CODES: Record<string, string> = {
  pdf: 'PDF',
  docx: 'DOC',
  doc: 'DOC',
  xlsx: 'XLS',
  xls: 'XLS',
  csv: 'CSV',
  pptx: 'PPT',
  txt: 'TXT',
  md: 'MD',
  html: 'HTM',
  htm: 'HTM',
  png: 'IMG',
  jpg: 'IMG',
  jpeg: 'IMG',
  webp: 'IMG',
  gif: 'IMG',
}

/** The letters on a source's tile: the file kind, "URL" for links, the app for connectors. */
export function getSourceKindCode(
  source: Pick<KnowledgeSourceDto, 'type' | 'name' | 'connector'>,
): string {
  if (source.type === 'link') return 'URL'
  if (source.type === 'connector') {
    return source.connector ? CONNECTOR_TILES[source.connector.provider] : 'SYNC'
  }
  const extension = source.name.split('.').pop()?.toLowerCase() ?? ''
  return KIND_CODES[extension] ?? 'FILE'
}

/** A connector source paused because its connection's sign-in expired; Reconnect resumes it. */
export function isSignInExpired(
  source: Pick<KnowledgeSourceDto, 'type' | 'status' | 'errorCode'>,
): boolean {
  return (
    source.type === 'connector' &&
    source.status === 'paused' &&
    source.errorCode === ERROR_CODES.KNOWLEDGE_CONNECTION_EXPIRED
  )
}

/** Paused connector sources by the connection whose sign-in expired, in the order first seen. */
export function groupExpiredByConnection(
  sources: readonly KnowledgeSourceDto[],
): { connectionId: string; sources: KnowledgeSourceDto[] }[] {
  const groups = new Map<string, KnowledgeSourceDto[]>()
  for (const source of sources) {
    if (!isSignInExpired(source) || !source.connectionId) continue
    groups.set(source.connectionId, [...(groups.get(source.connectionId) ?? []), source])
  }
  return [...groups].map(([connectionId, items]) => ({ connectionId, sources: items }))
}

/** The first folder's name and how many more a connector syncs ("Public + 2 more"). */
export function summarizeFolders(folders: KnowledgeConnectorConfig['folders']): {
  first: string
  more: number
} {
  return { first: folders[0]?.name ?? '', more: Math.max(folders.length - 1, 0) }
}
