// SPDX-License-Identifier: AGPL-3.0-only
import { KNOWLEDGE_FAILURE_CODES } from '@surefy/contracts'
import type {
  KnowledgeConnectorConfig,
  KnowledgeDocumentDto,
  KnowledgeLinkConfig,
  KnowledgeSourceDto,
  UserRefDto,
} from '@surefy/contracts'

import { purgeAtOf } from '../knowledgeViews.js'

import type {
  DocumentStats,
  KnowledgeDocumentRow,
  KnowledgeSourceRow,
} from './knowledgeSources.repository.js'

type FailureCode = (typeof KNOWLEDGE_FAILURE_CODES)[number]

/** A stored code that is not one of the contract's failure codes is shown as no reason. */
export const failureCodeOf = (code: string | null): FailureCode | null =>
  KNOWLEDGE_FAILURE_CODES.find((known) => known === code) ?? null

const NO_STATS: DocumentStats = { documentCount: 0, failedDocumentCount: 0, passageCount: 0 }

function configOf(row: KnowledgeSourceRow): {
  link: KnowledgeLinkConfig | null
  connector: KnowledgeConnectorConfig | null
} {
  const config = row.config
  if (config === null) return { link: null, connector: null }
  return {
    link: 'link' in config ? config.link : null,
    connector: 'connector' in config ? config.connector : null,
  }
}

export function toSourceDto(
  row: KnowledgeSourceRow,
  stats: DocumentStats | undefined,
  people: ReadonlyMap<string, UserRefDto>,
): KnowledgeSourceDto {
  const counts = stats ?? NO_STATS
  const { link, connector } = configOf(row)
  return {
    id: row.id,
    knowledgeBaseId: row.knowledgeBaseId,
    type: row.type,
    name: row.name,
    fileName: row.fileName,
    contentType: row.contentType,
    sizeBytes: row.sizeBytes,
    link,
    connector,
    ocrMode: row.ocrMode,
    status: row.status,
    progressPercent: row.progressPercent,
    errorCode: failureCodeOf(row.errorCode),
    documentCount: counts.documentCount,
    failedDocumentCount: counts.failedDocumentCount,
    passageCount: counts.passageCount,
    lastSyncedAt: row.lastSyncedAt?.toISOString() ?? null,
    nextSyncAt: row.nextSyncAt?.toISOString() ?? null,
    addedBy: row.addedByUserId === null ? null : (people.get(row.addedByUserId) ?? null),
    deletedAt: row.deletedAt?.toISOString() ?? null,
    purgeAt: purgeAtOf(row.deletedAt),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

export function toDocumentDto(row: KnowledgeDocumentRow): KnowledgeDocumentDto {
  return {
    id: row.id,
    knowledgeBaseId: row.knowledgeBaseId,
    sourceId: row.sourceId,
    title: row.title,
    mimeType: row.mimeType,
    sizeBytes: row.sizeBytes,
    pageCount: row.pageCount,
    status: row.status,
    errorCode: failureCodeOf(row.errorCode),
    chunkCount: row.chunkCount,
    citationCount: row.citationCount,
    indexedAt: row.indexedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}
