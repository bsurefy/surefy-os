// SPDX-License-Identifier: AGPL-3.0-only
import { and, eq, inArray, isNull, ne, sql } from 'drizzle-orm'

import {
  knowledgeBases,
  knowledgeChunks,
  knowledgeDocuments,
  knowledgeSources,
} from '@/database/tables/index.js'
import type {
  KnowledgeDocumentStatus,
  KnowledgeOcrMode,
  KnowledgeSourceStatus,
} from '@surefy/contracts'

import type { KnowledgeBaseRow } from '../knowledge.repository.js'
import type { Chunk } from './knowledgeChunker.js'
import type {
  KnowledgeDocumentRow,
  KnowledgeSourceRow,
} from '../knowledgeSources/knowledgeSources.repository.js'
import type { DbExecutor } from '@/core/database/index.js'

const kb = knowledgeBases
const ks = knowledgeSources
const kd = knowledgeDocuments
const kc = knowledgeChunks

export type DocumentPatch = Partial<
  Pick<
    typeof kd.$inferInsert,
    | 'status'
    | 'errorCode'
    | 'title'
    | 'pageCount'
    | 'parsedObjectKey'
    | 'embeddingModelKey'
    | 'chunkCount'
    | 'indexedAt'
    | 'contentHash'
    | 'sizeBytes'
    | 'mimeType'
  >
>

export interface IngestTarget {
  document: KnowledgeDocumentRow
  source: KnowledgeSourceRow
  base: KnowledgeBaseRow
}

/** True while the document's source and base are not deleted (running jobs stop when they are). */
export const isActiveTarget = (target: IngestTarget | undefined): target is IngestTarget =>
  target?.source.deletedAt === null && target.base.deletedAt === null

export interface SourceDocumentCounts {
  total: number
  open: number
  ready: number
  failed: number
  /** The code of the first failed document, for a source that failed as a whole. */
  failedCode: string | null
}

/** Rows per insert: 200 passages of 1,536 floats stay well below the parameter limit. */
const INSERT_BATCH = 200

/** Writes of the ingestion and re-embedding jobs; they run inside `db.tenant(orgId)`. */
export class KnowledgeIngestionRepository {
  /** The document with its source and base, or undefined when any of them is gone. */
  async loadTarget(
    tx: DbExecutor,
    orgId: string,
    documentId: string,
  ): Promise<IngestTarget | undefined> {
    const [row] = await tx
      .select({ document: kd, source: ks, base: kb })
      .from(kd)
      .innerJoin(ks, and(eq(ks.organizationId, kd.organizationId), eq(ks.id, kd.sourceId)))
      .innerJoin(kb, and(eq(kb.organizationId, kd.organizationId), eq(kb.id, kd.knowledgeBaseId)))
      .where(and(eq(kd.organizationId, orgId), eq(kd.id, documentId)))
    return row
  }

  async setDocument(
    tx: DbExecutor,
    orgId: string,
    documentId: string,
    patch: DocumentPatch,
  ): Promise<void> {
    await tx
      .update(kd)
      .set(patch)
      .where(and(eq(kd.organizationId, orgId), eq(kd.id, documentId)))
  }

  /**
   * Takes the document for processing: `pending → parsing`, atomically, so two jobs for one
   * document never both run. A retried attempt may also resume a document the last one left open.
   */
  async claim(
    tx: DbExecutor,
    orgId: string,
    documentId: string,
    resume: boolean,
  ): Promise<boolean> {
    const from: KnowledgeDocumentStatus[] = resume
      ? ['pending', 'parsing', 'embedding']
      : ['pending']
    const rows = await tx
      .update(kd)
      .set({ status: 'parsing', errorCode: null })
      .where(and(eq(kd.organizationId, orgId), eq(kd.id, documentId), inArray(kd.status, from)))
      .returning({ id: kd.id })
    return rows.length > 0
  }

  async setSource(
    tx: DbExecutor,
    orgId: string,
    sourceId: string,
    patch: { status?: KnowledgeSourceStatus; progressPercent?: number; errorCode?: string | null },
  ): Promise<KnowledgeSourceRow | undefined> {
    const [row] = await tx
      .update(ks)
      .set(patch)
      .where(and(eq(ks.organizationId, orgId), eq(ks.id, sourceId)))
      .returning()
    return row
  }

  async setOcrMode(
    tx: DbExecutor,
    orgId: string,
    sourceId: string,
    ocrMode: KnowledgeOcrMode,
  ): Promise<void> {
    await tx
      .update(ks)
      .set({ ocrMode })
      .where(and(eq(ks.organizationId, orgId), eq(ks.id, sourceId)))
  }

  /** Replaces a document's passages of one embedding model, inside the caller's transaction. */
  async replaceChunks(
    tx: DbExecutor,
    orgId: string,
    document: { id: string; knowledgeBaseId: string; sourceId: string },
    embeddingModel: string,
    items: readonly { chunk: Chunk; embedding: readonly number[] }[],
  ): Promise<number> {
    await tx
      .delete(kc)
      .where(
        and(
          eq(kc.organizationId, orgId),
          eq(kc.documentId, document.id),
          eq(kc.embeddingModel, embeddingModel),
        ),
      )
    for (let at = 0; at < items.length; at += INSERT_BATCH) {
      await tx.insert(kc).values(
        items.slice(at, at + INSERT_BATCH).map(({ chunk, embedding }) => ({
          organizationId: orgId,
          knowledgeBaseId: document.knowledgeBaseId,
          sourceId: document.sourceId,
          documentId: document.id,
          ordinal: chunk.ordinal,
          content: chunk.content,
          pageFrom: chunk.pageFrom,
          pageTo: chunk.pageTo,
          headingPath: chunk.headingPath,
          tokenCount: chunk.tokenCount,
          embedding: [...embedding],
          embeddingModel,
        })),
      )
    }
    return items.length
  }

  async deleteChunksOfModel(
    tx: DbExecutor,
    orgId: string,
    baseId: string,
    embeddingModel: string,
  ): Promise<void> {
    await tx
      .delete(kc)
      .where(
        and(
          eq(kc.organizationId, orgId),
          eq(kc.knowledgeBaseId, baseId),
          eq(kc.embeddingModel, embeddingModel),
        ),
      )
  }

  /** Whether the document already has passages of the model (re-embedding skips it). */
  async hasChunks(
    tx: DbExecutor,
    orgId: string,
    documentId: string,
    embeddingModel: string,
  ): Promise<boolean> {
    const [row] = await tx
      .select({ id: kc.id })
      .from(kc)
      .where(
        and(
          eq(kc.organizationId, orgId),
          eq(kc.documentId, documentId),
          eq(kc.embeddingModel, embeddingModel),
        ),
      )
      .limit(1)
    return row !== undefined
  }

  async documentCounts(
    tx: DbExecutor,
    orgId: string,
    sourceId: string,
  ): Promise<SourceDocumentCounts> {
    const result = await tx.execute<{
      total: number
      open: number
      ready: number
      failed: number
      failed_code: string | null
    }>(sql`
      select count(*)::integer as total,
        count(*) filter (where status in ('pending', 'parsing', 'embedding'))::integer as open,
        count(*) filter (where status = 'ready')::integer as ready,
        count(*) filter (where status = 'failed')::integer as failed,
        (array_agg(error_code order by created_at) filter (where status = 'failed'))[1] as failed_code
      from knowledge_documents
      where organization_id = ${orgId}::uuid and source_id = ${sourceId}::uuid`)
    const row = result.rows[0]
    return {
      total: row?.total ?? 0,
      open: row?.open ?? 0,
      ready: row?.ready ?? 0,
      failed: row?.failed ?? 0,
      failedCode: row?.failed_code ?? null,
    }
  }

  /**
   * Ready and failed documents of the base's active sources go back to `pending` and their
   * sources to `queued` (a chunking preset change, Re-index all, a retry). Documents already in
   * flight are left alone. Returns the ids to enqueue after commit.
   */
  async resetDocuments(
    tx: DbExecutor,
    orgId: string,
    baseId: string,
    sourceIds?: readonly string[],
    statuses: readonly KnowledgeDocumentStatus[] = ['ready', 'failed'],
  ): Promise<string[]> {
    if (sourceIds?.length === 0) return []
    const sourceFilter = sourceIds === undefined ? undefined : inArray(kd.sourceId, [...sourceIds])
    const activeSources = tx
      .select({ id: ks.id })
      .from(ks)
      .where(
        and(eq(ks.organizationId, orgId), eq(ks.knowledgeBaseId, baseId), isNull(ks.deletedAt)),
      )
    const rows = await tx
      .update(kd)
      .set({ status: 'pending', errorCode: null })
      .where(
        and(
          eq(kd.organizationId, orgId),
          eq(kd.knowledgeBaseId, baseId),
          inArray(kd.status, [...statuses]),
          inArray(kd.sourceId, activeSources),
          sourceFilter,
        ),
      )
      .returning({ id: kd.id, sourceId: kd.sourceId })
    const touched = [...new Set(rows.map((row) => row.sourceId))]
    if (touched.length > 0) {
      await tx
        .update(ks)
        .set({ status: 'queued', progressPercent: 0, errorCode: null })
        .where(and(eq(ks.organizationId, orgId), inArray(ks.id, touched)))
    }
    return rows.map((row) => row.id)
  }

  /** Ready documents of the base's active sources that are not yet on `targetModel`. */
  async documentsToReembed(
    tx: DbExecutor,
    orgId: string,
    baseId: string,
    targetModel: string,
    limit: number,
  ): Promise<string[]> {
    const result = await tx.execute<{ id: string }>(sql`
      select d.id
      from knowledge_documents d
      join knowledge_sources s on s.organization_id = d.organization_id and s.id = d.source_id
      where d.organization_id = ${orgId}::uuid and d.knowledge_base_id = ${baseId}::uuid
        and d.status = 'ready' and s.deleted_at is null
        and not exists (
          select 1 from knowledge_chunks c
          where c.organization_id = d.organization_id and c.document_id = d.id
            and c.embedding_model = ${targetModel})
      order by d.id
      limit ${limit}`)
    return result.rows.map((row) => row.id)
  }

  /**
   * The swap (database/knowledge.md, Re-embedding swap), in one transaction: the target becomes
   * the active model, the old model's passages go, and every counter is recomputed. False when
   * the change was cancelled or replaced meanwhile.
   */
  async swapEmbeddingModel(
    tx: DbExecutor,
    orgId: string,
    baseId: string,
    target: string,
  ): Promise<boolean> {
    const rows = await tx
      .update(kb)
      .set({ embeddingModelKey: target, pendingEmbeddingModelKey: null })
      .where(
        and(
          eq(kb.organizationId, orgId),
          eq(kb.id, baseId),
          eq(kb.pendingEmbeddingModelKey, target),
        ),
      )
      .returning({ id: kb.id })
    if (rows.length === 0) return false
    await tx
      .delete(kc)
      .where(
        and(
          eq(kc.organizationId, orgId),
          eq(kc.knowledgeBaseId, baseId),
          ne(kc.embeddingModel, target),
        ),
      )
    // documents that kept failing lose their old passages at the swap, and show Retry
    await tx.execute(sql`
      update knowledge_documents d set
        embedding_model_key = ${target},
        chunk_count = (select count(*)::integer from knowledge_chunks c
          where c.organization_id = d.organization_id and c.document_id = d.id
            and c.embedding_model = ${target})
      where d.organization_id = ${orgId}::uuid and d.knowledge_base_id = ${baseId}::uuid
        and d.status = 'ready'`)
    return true
  }

  /** Link sources whose time has come, across organizations (system scope). */
  async dueSources(
    tx: DbExecutor,
    now: Date,
    limit: number,
  ): Promise<{ orgId: string; sourceId: string }[]> {
    const rows = await tx
      .select({ orgId: ks.organizationId, sourceId: ks.id })
      .from(ks)
      .innerJoin(kb, and(eq(kb.organizationId, ks.organizationId), eq(kb.id, ks.knowledgeBaseId)))
      .where(
        and(
          isNull(ks.deletedAt),
          isNull(kb.deletedAt),
          ne(ks.status, 'paused'),
          sql`${ks.nextSyncAt} <= ${now}`,
        ),
      )
      .orderBy(ks.nextSyncAt)
      .limit(limit)
    return rows
  }
}
