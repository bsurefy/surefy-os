// SPDX-License-Identifier: AGPL-3.0-only
import { KNOWLEDGE_ERROR_CODES } from '@surefy/contracts'

import { CHUNKING_PRESETS, EMBED_BATCH_SIZE } from '../knowledge.constants.js'
import { parsedKeyOf } from '../knowledge.keys.js'
import { chunkDocument, embeddingInput } from './knowledgeChunker.js'
import { isActiveTarget } from './knowledgeIngestion.repository.js'

import type { KnowledgeRepository } from '../knowledge.repository.js'
import type { KnowledgeFiles, KnowledgeGateway } from '../knowledge.types.js'
import type { KnowledgeIngestionRepository } from './knowledgeIngestion.repository.js'
import type { KnowledgeIngestionService } from './knowledgeIngestion.service.js'
import type { Database } from '@/core/database/index.js'
import type { Logger } from '@/core/logger/index.js'
import type { ParsedDocument } from '@/integrations/ml/index.js'

export interface KnowledgeReembedDeps {
  db: Database
  repository: KnowledgeRepository
  ingestion: KnowledgeIngestionRepository
  service: KnowledgeIngestionService
  files: KnowledgeFiles
  gateway: Pick<KnowledgeGateway, 'embedMany'>
  logger: Logger
}

/** Documents re-embedded per round; the base is checked again between rounds (cancel, delete). */
const ROUND = 25
/** A document is tried this often before it fails with `KNOWLEDGE_REEMBED_FAILED`. */
const DOCUMENT_ATTEMPTS = 2

/**
 * The re-embedding job (database/knowledge.md, Re-embedding swap): embed every ready document
 * with the target model next to its old passages, then swap in one transaction. Retrieval keeps
 * using the active model until the swap, so the base is never unsearchable.
 */
export class KnowledgeReembedService {
  constructor(private readonly deps: KnowledgeReembedDeps) {}

  async reembedBase(orgId: string, baseId: string): Promise<void> {
    for (;;) {
      const round = await this.deps.db.tenant(orgId, async (tx) => {
        const base = await this.deps.repository.findBase(tx, orgId, baseId)
        const target = base?.pendingEmbeddingModelKey ?? null
        if (base?.deletedAt !== null || target === null) return null
        const ids = await this.deps.ingestion.documentsToReembed(tx, orgId, baseId, target, ROUND)
        if (ids.length > 0) return { target, ids }
        // nothing left: swap atomically, then recount
        if (await this.deps.ingestion.swapEmbeddingModel(tx, orgId, baseId, target)) {
          await this.deps.repository.recomputeCounters(tx, orgId, baseId)
        }
        return null
      })
      if (round === null) return
      for (const documentId of round.ids) {
        await this.reembedDocument(orgId, baseId, documentId, round.target)
      }
    }
  }

  /** Embeds one document with the target model; a document that keeps failing is marked failed. */
  private async reembedDocument(
    orgId: string,
    baseId: string,
    documentId: string,
    target: string,
  ): Promise<void> {
    let lastError: unknown
    for (let attempt = 1; attempt <= DOCUMENT_ATTEMPTS; attempt += 1) {
      try {
        await this.embedOnce(orgId, baseId, documentId, target)
        return
      } catch (error) {
        lastError = error
      }
    }
    this.deps.logger.warn({ err: lastError, orgId, documentId }, 're-embedding failed')
    await this.deps.service.failDocument(
      orgId,
      documentId,
      KNOWLEDGE_ERROR_CODES.KNOWLEDGE_REEMBED_FAILED,
    )
  }

  private async embedOnce(
    orgId: string,
    baseId: string,
    documentId: string,
    target: string,
  ): Promise<void> {
    const loaded = await this.deps.db.tenant(orgId, (tx) =>
      this.deps.ingestion.loadTarget(tx, orgId, documentId),
    )
    if (
      !isActiveTarget(loaded) ||
      loaded.document.status !== 'ready' ||
      loaded.base.pendingEmbeddingModelKey !== target
    ) {
      return
    }
    const bytes = await this.deps.files.read(parsedKeyOf(orgId, documentId))
    if (bytes === null) throw new Error('the parsed document is missing')
    const parsed = JSON.parse(bytes.toString('utf8')) as ParsedDocument
    const chunks = chunkDocument(parsed, CHUNKING_PRESETS[loaded.base.chunkingPreset])
    const call = {
      orgId,
      userId: loaded.source.addedByUserId,
      teamIds: [],
      primaryTeamId: null,
      allowedModelIds: 'all' as const,
      caller: 'knowledge' as const,
    }
    const vectors: number[][] = []
    for (let at = 0; at < chunks.length; at += EMBED_BATCH_SIZE) {
      const batch = chunks.slice(at, at + EMBED_BATCH_SIZE)
      const result = await this.deps.gateway.embedMany(
        {
          ...call,
          meter: { key: `knowledge:${documentId}:${target}:${at}`, sourceRefId: documentId },
        },
        { modelKey: target, values: batch.map(embeddingInput) },
      )
      vectors.push(...result.embeddings)
    }
    await this.deps.db.tenant(orgId, async (tx) => {
      // the change may have been cancelled or the document removed while embedding
      const again = await this.deps.ingestion.loadTarget(tx, orgId, documentId)
      if (!isActiveTarget(again) || again.base.pendingEmbeddingModelKey !== target) return
      await this.deps.ingestion.replaceChunks(
        tx,
        orgId,
        { id: documentId, knowledgeBaseId: baseId, sourceId: loaded.source.id },
        target,
        chunks.flatMap((chunk, index) => {
          const embedding = vectors[index]
          return embedding === undefined ? [] : [{ chunk, embedding }]
        }),
      )
    })
  }
}
