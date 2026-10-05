// SPDX-License-Identifier: AGPL-3.0-only
import { and, count, eq, ilike, inArray, isNotNull, isNull, sql, sum } from 'drizzle-orm'

import { knowledgeChunks, knowledgeDocuments, knowledgeSources } from '@/database/tables/index.js'
import {
  keysetAfter,
  keysetKey,
  keysetOrder,
  parseSort,
  type KeysetCursor,
  type KeysetSort,
} from '@/lib/pagination.js'
import type {
  KnowledgeDocumentStatus,
  KnowledgeSourceStatus,
  KnowledgeSourceType,
} from '@surefy/contracts'

import type { DbExecutor } from '@/core/database/index.js'

export type KnowledgeSourceRow = typeof knowledgeSources.$inferSelect
export type NewKnowledgeSourceRow = typeof knowledgeSources.$inferInsert
export type KnowledgeSourcePatch = Partial<
  Pick<
    NewKnowledgeSourceRow,
    | 'name'
    | 'config'
    | 'ocrMode'
    | 'status'
    | 'progressPercent'
    | 'errorCode'
    | 'lastSyncedAt'
    | 'nextSyncAt'
  >
>
export type KnowledgeDocumentRow = typeof knowledgeDocuments.$inferSelect
export type NewKnowledgeDocumentRow = typeof knowledgeDocuments.$inferInsert

export interface SourcePageParams {
  limit: number
  cursor?: KeysetCursor
  sort: KeysetSort
  q?: string
  types?: readonly KnowledgeSourceType[]
  statuses?: readonly KnowledgeSourceStatus[]
  deleted: boolean
}

export interface DocumentPageParams {
  limit: number
  cursor?: KeysetCursor
  sort: KeysetSort
  q?: string
  statuses?: readonly KnowledgeDocumentStatus[]
}

export interface DocumentStats {
  documentCount: number
  failedDocumentCount: number
  passageCount: number
}

const likeTerm = (q: string): string => `%${q.replaceAll(/[\\%_]/g, (c) => '\\' + c)}%`

const ks = knowledgeSources
const kd = knowledgeDocuments

/** `?sort=` of the Sources tab: newest first by default. */
export const knowledgeSourceSort = (sort: string | undefined): KeysetSort => {
  const { field, descending } = parseSort<'createdAt' | 'name' | 'sizeBytes'>(sort, '-createdAt')
  if (field === 'name') return { expression: sql`lower(${ks.name})`, cast: 'text', descending }
  if (field === 'sizeBytes') {
    return { expression: sql`coalesce(${ks.sizeBytes}, 0)`, cast: 'bigint', descending }
  }
  return { expression: ks.createdAt, cast: 'timestamptz', descending }
}

export const knowledgeDocumentSort = (sort: string | undefined): KeysetSort => {
  const { field, descending } = parseSort<'title' | 'createdAt'>(sort, 'title')
  return field === 'title'
    ? { expression: sql`lower(${kd.title})`, cast: 'text', descending }
    : { expression: kd.createdAt, cast: 'timestamptz', descending }
}

/** `knowledge_sources` and `knowledge_documents`. Every query filters by organization and base. */
export class KnowledgeSourcesRepository {
  async insertSource(tx: DbExecutor, values: NewKnowledgeSourceRow): Promise<KnowledgeSourceRow> {
    const [row] = await tx.insert(ks).values(values).returning()
    if (row === undefined) throw new Error('knowledge source insert returned no row')
    return row
  }

  async insertDocument(
    tx: DbExecutor,
    values: NewKnowledgeDocumentRow,
  ): Promise<KnowledgeDocumentRow> {
    const [row] = await tx.insert(kd).values(values).returning()
    if (row === undefined) throw new Error('knowledge document insert returned no row')
    return row
  }

  findSource(tx: DbExecutor, orgId: string, baseId: string, sourceId: string) {
    return tx.query.knowledgeSources.findFirst({
      where: and(eq(ks.organizationId, orgId), eq(ks.knowledgeBaseId, baseId), eq(ks.id, sourceId)),
    })
  }

  /** A source by id alone, for jobs that start from a source id. */
  findSourceById(tx: DbExecutor, orgId: string, sourceId: string) {
    return tx.query.knowledgeSources.findFirst({
      where: and(eq(ks.organizationId, orgId), eq(ks.id, sourceId)),
    })
  }

  /** Removes documents (their passages go with them); the caller deletes their stored files. */
  async deleteDocuments(
    tx: DbExecutor,
    orgId: string,
    documentIds: readonly string[],
  ): Promise<void> {
    if (documentIds.length === 0) return
    await tx.delete(kd).where(and(eq(kd.organizationId, orgId), inArray(kd.id, [...documentIds])))
  }

  async updateDocumentContent(
    tx: DbExecutor,
    orgId: string,
    documentId: string,
    patch: Pick<NewKnowledgeDocumentRow, 'contentHash' | 'sizeBytes' | 'mimeType' | 'title'>,
  ): Promise<void> {
    await tx
      .update(kd)
      .set({ ...patch, status: 'pending', errorCode: null })
      .where(and(eq(kd.organizationId, orgId), eq(kd.id, documentId)))
  }

  findSources(tx: DbExecutor, orgId: string, baseId: string, sourceIds: readonly string[]) {
    if (sourceIds.length === 0) return Promise.resolve([])
    return tx
      .select()
      .from(ks)
      .where(
        and(
          eq(ks.organizationId, orgId),
          eq(ks.knowledgeBaseId, baseId),
          inArray(ks.id, [...sourceIds]),
        ),
      )
  }

  async updateSource(
    tx: DbExecutor,
    orgId: string,
    sourceId: string,
    patch: KnowledgeSourcePatch,
  ): Promise<KnowledgeSourceRow | undefined> {
    const [row] = await tx
      .update(ks)
      .set(patch)
      .where(and(eq(ks.organizationId, orgId), eq(ks.id, sourceId)))
      .returning()
    return row
  }

  async softDeleteSource(
    tx: DbExecutor,
    orgId: string,
    sourceId: string,
    userId: string | null,
  ): Promise<KnowledgeSourceRow | undefined> {
    const [row] = await tx
      .update(ks)
      .set({ deletedAt: new Date(), deletedByUserId: userId, nextSyncAt: null })
      .where(and(eq(ks.organizationId, orgId), eq(ks.id, sourceId), isNull(ks.deletedAt)))
      .returning()
    return row
  }

  async restoreSource(
    tx: DbExecutor,
    orgId: string,
    sourceId: string,
    nextSyncAt: Date | null,
  ): Promise<KnowledgeSourceRow | undefined> {
    const [row] = await tx
      .update(ks)
      .set({ deletedAt: null, deletedByUserId: null, nextSyncAt })
      .where(and(eq(ks.organizationId, orgId), eq(ks.id, sourceId), isNotNull(ks.deletedAt)))
      .returning()
    return row
  }

  listSourcesPage(tx: DbExecutor, orgId: string, baseId: string, page: SourcePageParams) {
    return tx
      .select({ source: ks, sortKey: keysetKey(page.sort) })
      .from(ks)
      .where(
        and(
          eq(ks.organizationId, orgId),
          eq(ks.knowledgeBaseId, baseId),
          page.deleted ? isNotNull(ks.deletedAt) : isNull(ks.deletedAt),
          page.q === undefined ? undefined : ilike(ks.name, likeTerm(page.q)),
          page.types === undefined || page.types.length === 0
            ? undefined
            : inArray(ks.type, [...page.types]),
          page.statuses === undefined || page.statuses.length === 0
            ? undefined
            : inArray(ks.status, [...page.statuses]),
          keysetAfter(page.sort, ks.id, page.cursor),
        ),
      )
      .orderBy(...keysetOrder(page.sort, ks.id))
      .limit(page.limit + 1)
  }

  /** The file source of the base with these bytes, for duplicate detection. */
  async findDuplicate(
    tx: DbExecutor,
    orgId: string,
    baseId: string,
    sha256: Buffer,
  ): Promise<KnowledgeSourceRow | undefined> {
    const [row] = await tx
      .select()
      .from(ks)
      .where(
        and(
          eq(ks.organizationId, orgId),
          eq(ks.type, 'file'),
          isNull(ks.deletedAt),
          eq(ks.knowledgeBaseId, baseId),
          eq(ks.sha256, sha256),
        ),
      )
      .limit(1)
    return row
  }

  /** Documents, failed documents and passages per source, for the Sources table. */
  async documentStats(
    tx: DbExecutor,
    orgId: string,
    sourceIds: readonly string[],
  ): Promise<Map<string, DocumentStats>> {
    const stats = new Map<string, DocumentStats>()
    if (sourceIds.length === 0) return stats
    const rows = await tx
      .select({
        sourceId: kd.sourceId,
        documents: count(),
        failed: sql<number>`count(*) filter (where ${kd.status} = 'failed')::integer`,
        passages: sum(kd.chunkCount).mapWith(Number),
      })
      .from(kd)
      .where(and(eq(kd.organizationId, orgId), inArray(kd.sourceId, [...sourceIds])))
      .groupBy(kd.sourceId)
    for (const row of rows) {
      stats.set(row.sourceId, {
        documentCount: row.documents,
        failedDocumentCount: row.failed,
        passageCount: row.passages,
      })
    }
    return stats
  }

  // ── Documents ─────────────────────────────────────────────────────────────────────────────────

  listDocumentsPage(
    tx: DbExecutor,
    orgId: string,
    baseId: string,
    sourceId: string,
    page: DocumentPageParams,
  ) {
    return tx
      .select({ document: kd, sortKey: keysetKey(page.sort) })
      .from(kd)
      .where(
        and(
          eq(kd.organizationId, orgId),
          eq(kd.knowledgeBaseId, baseId),
          eq(kd.sourceId, sourceId),
          page.q === undefined ? undefined : ilike(kd.title, likeTerm(page.q)),
          page.statuses === undefined || page.statuses.length === 0
            ? undefined
            : inArray(kd.status, [...page.statuses]),
          keysetAfter(page.sort, kd.id, page.cursor),
        ),
      )
      .orderBy(...keysetOrder(page.sort, kd.id))
      .limit(page.limit + 1)
  }

  findDocument(tx: DbExecutor, orgId: string, baseId: string, documentId: string) {
    return tx.query.knowledgeDocuments.findFirst({
      where: and(
        eq(kd.organizationId, orgId),
        eq(kd.knowledgeBaseId, baseId),
        eq(kd.id, documentId),
      ),
    })
  }

  /** The document ids and object keys of sources, for removing files after a hard delete. */
  documentsOfSources(tx: DbExecutor, orgId: string, sourceIds: readonly string[]) {
    if (sourceIds.length === 0) return Promise.resolve([])
    return tx
      .select()
      .from(kd)
      .where(and(eq(kd.organizationId, orgId), inArray(kd.sourceId, [...sourceIds])))
  }

  /** The passages of a document for the preview, in order, with where each sits. */
  chunksOfDocument(tx: DbExecutor, orgId: string, documentId: string, embeddingModel: string) {
    return tx
      .select({
        id: knowledgeChunks.id,
        ordinal: knowledgeChunks.ordinal,
        content: knowledgeChunks.content,
        pageFrom: knowledgeChunks.pageFrom,
      })
      .from(knowledgeChunks)
      .where(
        and(
          eq(knowledgeChunks.organizationId, orgId),
          eq(knowledgeChunks.documentId, documentId),
          eq(knowledgeChunks.embeddingModel, embeddingModel),
        ),
      )
      .orderBy(knowledgeChunks.ordinal)
  }

  /** Failed documents of a source (Retry, Retry with OCR). */
  failedDocumentIds(tx: DbExecutor, orgId: string, sourceId: string): Promise<string[]> {
    return tx
      .select({ id: kd.id })
      .from(kd)
      .where(and(eq(kd.organizationId, orgId), eq(kd.sourceId, sourceId), eq(kd.status, 'failed')))
      .then((rows) => rows.map((row) => row.id))
  }
}
