// SPDX-License-Identifier: AGPL-3.0-only
import { UnprocessableError } from '@/core/errors/index.js'
import { decodeCursor, encodeCursor, toPage } from '@/lib/pagination.js'
import { uuidv7 } from '@/lib/uuidv7.js'
import { ERROR_CODES, KNOWLEDGE_AUDIT_ACTIONS } from '@surefy/contracts'
import type {
  BulkKnowledgeSourcesInput,
  BulkKnowledgeSourcesResultDto,
  CreateKnowledgeLinkInput,
  DownloadLinkDto,
  KnowledgeDocumentDetailDto,
  KnowledgeDocumentDto,
  KnowledgeDocumentPageDto,
  KnowledgeFileUploadDto,
  KnowledgeSourceDto,
  ListKnowledgeDocumentPagesQuery,
  ListKnowledgeDocumentsQuery,
  ListKnowledgeSourcesQuery,
  RequestKnowledgeFileUploadInput,
  RetryKnowledgeSourceInput,
  UpdateKnowledgeSourceInput,
} from '@surefy/contracts'

import {
  KnowledgeBaseDeletedError,
  KnowledgeDocumentNotFoundError,
  KnowledgeDuplicateFileError,
  KnowledgeNoEmbeddingModelError,
  KnowledgeSourceNotFoundError,
  KnowledgeSourceStateInvalidError,
} from '../knowledge.errors.js'
import { sourceKeyOf } from '../knowledge.keys.js'
import { toDocumentDto, toSourceDto } from './knowledgeSources.mapper.js'
import { buildPreviewPages } from './knowledgeSources.preview.js'
import {
  knowledgeDocumentSort,
  knowledgeSourceSort,
  type KnowledgeSourceRow,
  type KnowledgeSourcesRepository,
} from './knowledgeSources.repository.js'
import { nextSyncAfter } from '../knowledgeIngestion/knowledgeCrawler.js'

import type { KnowledgeRepository } from '../knowledge.repository.js'
import type {
  KnowledgeContext,
  KnowledgeFiles,
  KnowledgeIngestionPort,
  KnowledgeUsers,
} from '../knowledge.types.js'
import type { KnowledgeAccessService } from '../knowledgeAccess.service.js'
import type { Database, DbExecutor } from '@/core/database/index.js'
import type { ParsedDocument } from '@/integrations/ml/index.js'
import type { AuditRecorder } from '@/modules/audit/index.js'

export interface KnowledgeSourcesDeps {
  db: Database
  repository: KnowledgeRepository
  sources: KnowledgeSourcesRepository
  access: KnowledgeAccessService
  files: KnowledgeFiles
  ingestion: KnowledgeIngestionPort
  users: KnowledgeUsers
  audit: AuditRecorder
  now?: () => Date
}

/** A signed upload lasts an hour: a 100 MB file on a slow connection still fits. */
const UPLOAD_EXPIRES_SECONDS = 3600
const DOWNLOAD_EXPIRES_SECONDS = 300
const ACTIVE_STATES = new Set(['queued', 'processing'])
const RETRYABLE = new Set(['failed', 'partially_failed', 'paused'])

/** Contract: the link is read over HTTP(S) only; a file or ftp address is not a link source. */
const assertWebAddress = (url: string): void => {
  const protocol = new URL(url).protocol
  if (protocol !== 'http:' && protocol !== 'https:') {
    throw new UnprocessableError(
      ERROR_CODES.VALIDATION_FAILED,
      'A link must start with http or https',
    )
  }
}

/** The names the Sources table shows: a link without a title is named by its host. */
const defaultLinkName = (url: string): string => new URL(url).hostname

/**
 * Sources and documents of a knowledge base (database/knowledge.md §3–4, Duplicate detection):
 * uploads that go straight to storage and are verified by hash, link sources, retry and re-index,
 * soft delete and restore, and the document preview. Everything needs the base to be reachable;
 * writes need Can manage on it.
 */
export class KnowledgeSourcesService {
  constructor(private readonly deps: KnowledgeSourcesDeps) {}

  // ── Reading ───────────────────────────────────────────────────────────────────────────────────

  async list(
    ctx: KnowledgeContext,
    baseId: string,
    query: ListKnowledgeSourcesQuery,
  ): Promise<{ items: KnowledgeSourceDto[]; nextCursor: string | null }> {
    const deleted = query.state === 'deleted'
    const sort = knowledgeSourceSort(query.sort)
    const rows = await this.deps.db.tenant(ctx.orgId, async (tx) => {
      // a deleted source is for the people who can restore it
      await this.deps.access.require(tx, ctx, baseId, deleted ? 'manage' : 'search')
      return this.deps.sources.listSourcesPage(tx, ctx.orgId, baseId, {
        limit: query.limit,
        sort,
        deleted,
        ...(query.q === undefined ? {} : { q: query.q }),
        ...(query.type === undefined ? {} : { types: query.type }),
        ...(query.status === undefined ? {} : { statuses: query.status }),
        ...(query.cursor === undefined ? {} : { cursor: decodeCursor(query.cursor) }),
      })
    })
    const { items, nextCursor } = toPage(rows, query.limit, (row) => ({
      k: row.sortKey,
      id: row.source.id,
    }))
    return {
      items: await this.dtos(
        ctx.orgId,
        items.map((row) => row.source),
      ),
      nextCursor,
    }
  }

  async get(ctx: KnowledgeContext, baseId: string, sourceId: string): Promise<KnowledgeSourceDto> {
    const row = await this.deps.db.tenant(ctx.orgId, async (tx) => {
      await this.deps.access.require(tx, ctx, baseId, 'search')
      return this.requireSource(tx, ctx.orgId, baseId, sourceId)
    })
    return this.dto(ctx.orgId, row)
  }

  async listDocuments(
    ctx: KnowledgeContext,
    baseId: string,
    sourceId: string,
    query: ListKnowledgeDocumentsQuery,
  ): Promise<{ items: KnowledgeDocumentDto[]; nextCursor: string | null }> {
    const sort = knowledgeDocumentSort(query.sort)
    const rows = await this.deps.db.tenant(ctx.orgId, async (tx) => {
      await this.deps.access.require(tx, ctx, baseId, 'search')
      await this.requireSource(tx, ctx.orgId, baseId, sourceId)
      return this.deps.sources.listDocumentsPage(tx, ctx.orgId, baseId, sourceId, {
        limit: query.limit,
        sort,
        ...(query.q === undefined ? {} : { q: query.q }),
        ...(query.status === undefined ? {} : { statuses: query.status }),
        ...(query.cursor === undefined ? {} : { cursor: decodeCursor(query.cursor) }),
      })
    })
    const { items, nextCursor } = toPage(rows, query.limit, (row) => ({
      k: row.sortKey,
      id: row.document.id,
    }))
    return { items: items.map((row) => toDocumentDto(row.document)), nextCursor }
  }

  /** The Source preview sheet's header. */
  async getDocument(
    ctx: KnowledgeContext,
    baseId: string,
    documentId: string,
  ): Promise<KnowledgeDocumentDetailDto> {
    const loaded = await this.deps.db.tenant(ctx.orgId, async (tx) => {
      const { level } = await this.deps.access.require(tx, ctx, baseId, 'search')
      const document = await this.deps.sources.findDocument(tx, ctx.orgId, baseId, documentId)
      if (document === undefined) throw new KnowledgeDocumentNotFoundError()
      const source = await this.requireSource(tx, ctx.orgId, baseId, document.sourceId)
      const grants = await this.deps.repository.grantsOfBases(tx, ctx.orgId, [baseId])
      return { level, document, source, grants }
    })
    return {
      document: toDocumentDto(loaded.document),
      source: { id: loaded.source.id, name: loaded.source.name, type: loaded.source.type },
      whoCanSearch: {
        teams: loaded.grants.flatMap((grant) =>
          grant.teamId === null || grant.teamName === null
            ? []
            : [{ id: grant.teamId, name: grant.teamName }],
        ),
        userCount: loaded.grants.filter((grant) => grant.subjectType === 'user').length,
      },
      canDownload: loaded.level === 'manage' && loaded.document.objectKey !== null,
    }
  }

  /** The extracted text by page, a few pages at a time. */
  async documentPages(
    ctx: KnowledgeContext,
    baseId: string,
    documentId: string,
    query: ListKnowledgeDocumentPagesQuery,
  ): Promise<{ items: KnowledgeDocumentPageDto[]; nextCursor: string | null }> {
    const { document, chunks } = await this.deps.db.tenant(ctx.orgId, async (tx) => {
      const { base } = await this.deps.access.require(tx, ctx, baseId, 'search')
      const found = await this.deps.sources.findDocument(tx, ctx.orgId, baseId, documentId)
      if (found === undefined) throw new KnowledgeDocumentNotFoundError()
      const model = base.embeddingModelKey
      return {
        document: found,
        chunks:
          model === null
            ? []
            : await this.deps.sources.chunksOfDocument(tx, ctx.orgId, documentId, model),
      }
    })
    if (document.parsedObjectKey === null) return { items: [], nextCursor: null }
    const bytes = await this.deps.files.read(document.parsedObjectKey)
    if (bytes === null) return { items: [], nextCursor: null }
    const pages = buildPreviewPages(JSON.parse(bytes.toString('utf8')) as ParsedDocument, chunks)
    const offset = query.cursor === undefined ? 0 : Number(decodeCursor(query.cursor).k)
    const items = pages.slice(offset, offset + query.limit)
    const next = offset + query.limit
    return {
      items,
      nextCursor: next < pages.length ? encodeCursor({ k: String(next), id: documentId }) : null,
    }
  }

  /** A signed link issued on click; each download is audited (Can manage only). */
  async download(
    ctx: KnowledgeContext,
    baseId: string,
    documentId: string,
  ): Promise<DownloadLinkDto> {
    const document = await this.deps.db.tenant(ctx.orgId, async (tx) => {
      await this.deps.access.require(tx, ctx, baseId, 'manage')
      const found = await this.deps.sources.findDocument(tx, ctx.orgId, baseId, documentId)
      if (found?.objectKey == null) throw new KnowledgeDocumentNotFoundError()
      await this.deps.audit.record(tx, ctx, {
        action: KNOWLEDGE_AUDIT_ACTIONS.KNOWLEDGE_SOURCE_DOWNLOADED,
        target: { type: 'knowledge_source', id: found.sourceId },
        metadata: { refs: { documentId } },
      })
      return found
    })
    const key = document.objectKey ?? sourceKeyOf(ctx.orgId, documentId)
    const url = await this.deps.files.signedDownload(key, {
      expiresInSeconds: DOWNLOAD_EXPIRES_SECONDS,
      disposition: `attachment; filename="${encodeURIComponent(document.title)}"`,
    })
    return {
      url,
      fileName: document.title,
      contentType: document.mimeType ?? 'application/octet-stream',
      sizeBytes: document.sizeBytes,
      expiresAt: new Date(
        (this.deps.now ?? (() => new Date()))().getTime() + DOWNLOAD_EXPIRES_SECONDS * 1000,
      ).toISOString(),
    }
  }

  // ── Adding ────────────────────────────────────────────────────────────────────────────────────

  /**
   * Creates the file source and its document, and returns the signed upload (the bytes go
   * straight to storage, then `complete`). A match in the same base answers 409 unless the person
   * chose to replace it (the old source is soft-deleted, so it is restorable) or keep both.
   */
  async requestFileUpload(
    ctx: KnowledgeContext,
    baseId: string,
    input: RequestKnowledgeFileUploadInput,
  ): Promise<KnowledgeFileUploadDto> {
    const documentId = uuidv7()
    const objectKey = sourceKeyOf(ctx.orgId, documentId)
    const sha256 = Buffer.from(input.sha256, 'hex')
    const { source, upload } = await this.deps.db.tenant(ctx.orgId, async (tx) => {
      const { base } = await this.deps.access.require(tx, ctx, baseId, 'manage')
      if (base.embeddingModelKey === null) throw new KnowledgeNoEmbeddingModelError()
      // signing makes no request; it is done after the access check and before anything is written
      const signed = await this.deps.files.signedUpload(objectKey, {
        contentType: input.contentType,
        sizeBytes: input.sizeBytes,
        expiresInSeconds: UPLOAD_EXPIRES_SECONDS,
      })
      const duplicate = await this.deps.sources.findDuplicate(tx, ctx.orgId, baseId, sha256)
      if (duplicate !== undefined) {
        if (input.duplicate === 'reject') {
          throw new KnowledgeDuplicateFileError({
            existingSource: {
              id: duplicate.id,
              name: duplicate.name,
              createdAt: duplicate.createdAt.toISOString(),
            },
          })
        }
        if (input.duplicate === 'replace') await this.softDelete(tx, ctx, duplicate)
      }
      const created = await this.deps.sources.insertSource(tx, {
        organizationId: ctx.orgId,
        knowledgeBaseId: baseId,
        type: 'file',
        name: input.fileName,
        fileName: input.fileName,
        contentType: input.contentType,
        sizeBytes: input.sizeBytes,
        sha256,
        ocrMode: input.ocrMode,
        status: 'uploading',
        addedByUserId: ctx.userId,
      })
      await this.deps.sources.insertDocument(tx, {
        id: documentId,
        organizationId: ctx.orgId,
        knowledgeBaseId: baseId,
        sourceId: created.id,
        externalRef: 'file',
        title: input.fileName,
        mimeType: input.contentType,
        sizeBytes: input.sizeBytes,
        objectKey,
        status: 'pending',
      })
      await this.deps.repository.recomputeCounters(tx, ctx.orgId, baseId)
      await this.deps.audit.record(tx, ctx, {
        action: KNOWLEDGE_AUDIT_ACTIONS.KNOWLEDGE_SOURCE_ADDED,
        target: { type: 'knowledge_source', id: created.id },
        metadata: { labels: { type: 'file', contentType: input.contentType } },
      })
      return { source: created, upload: signed }
    })
    return {
      source: await this.dto(ctx.orgId, source),
      upload: {
        url: upload.url,
        method: upload.method,
        headers: upload.headers,
        expiresAt: upload.expiresAt.toISOString(),
      },
    }
  }

  /**
   * The upload finished: the server hashes the stored bytes and compares them with the hash the
   * browser sent. A mismatch fails the source (`KNOWLEDGE_UPLOAD_CORRUPTED`); a match queues it.
   */
  async complete(
    ctx: KnowledgeContext,
    baseId: string,
    sourceId: string,
  ): Promise<KnowledgeSourceDto> {
    const { source, document } = await this.deps.db.tenant(ctx.orgId, async (tx) => {
      await this.deps.access.require(tx, ctx, baseId, 'manage')
      const found = await this.requireSource(tx, ctx.orgId, baseId, sourceId)
      if (found.type !== 'file' || found.status !== 'uploading') {
        throw new KnowledgeSourceStateInvalidError('This source is not waiting for an upload')
      }
      const documents = await this.deps.sources.documentsOfSources(tx, ctx.orgId, [sourceId])
      const [first] = documents
      if (first?.objectKey == null) throw new KnowledgeDocumentNotFoundError()
      return { source: found, document: first }
    })
    const key = document.objectKey ?? sourceKeyOf(ctx.orgId, document.id)
    const stored = await this.deps.files.inspect(key)
    if (stored === null)
      throw new KnowledgeSourceStateInvalidError('The file has not been uploaded')
    const intact =
      source.sha256 !== null &&
      stored.sha256 === source.sha256.toString('hex') &&
      stored.sizeBytes === source.sizeBytes

    const updated = await this.deps.db.tenant(ctx.orgId, async (tx) => {
      const row = await this.deps.sources.updateSource(tx, ctx.orgId, sourceId, {
        status: intact ? 'queued' : 'failed',
        progressPercent: 0,
        errorCode: intact ? null : 'KNOWLEDGE_UPLOAD_CORRUPTED',
      })
      if (row === undefined) throw new KnowledgeSourceNotFoundError()
      return row
    })
    if (!intact) {
      await this.deps.files.delete(key)
      return this.dto(ctx.orgId, updated)
    }
    await this.deps.ingestion.enqueueDocuments(ctx.orgId, [document.id])
    return this.dto(ctx.orgId, updated)
  }

  /** A link source: one page or a crawl of the same site; the first crawl runs at once. */
  async createLink(
    ctx: KnowledgeContext,
    baseId: string,
    input: CreateKnowledgeLinkInput,
  ): Promise<KnowledgeSourceDto> {
    assertWebAddress(input.url)
    const { name, ...link } = input
    const source = await this.deps.db.tenant(ctx.orgId, async (tx) => {
      const { base } = await this.deps.access.require(tx, ctx, baseId, 'manage')
      if (base.embeddingModelKey === null) throw new KnowledgeNoEmbeddingModelError()
      const created = await this.deps.sources.insertSource(tx, {
        organizationId: ctx.orgId,
        knowledgeBaseId: baseId,
        type: 'link',
        name: name ?? defaultLinkName(link.url),
        config: { version: 1, link },
        status: 'queued',
        addedByUserId: ctx.userId,
      })
      await this.deps.repository.recomputeCounters(tx, ctx.orgId, baseId)
      await this.deps.audit.record(tx, ctx, {
        action: KNOWLEDGE_AUDIT_ACTIONS.KNOWLEDGE_SOURCE_ADDED,
        target: { type: 'knowledge_source', id: created.id },
        metadata: { labels: { type: 'link', crawlDepth: link.crawlDepth, refresh: link.refresh } },
      })
      return created
    })
    await this.deps.ingestion.enqueueSync(ctx.orgId, source.id)
    return this.dto(ctx.orgId, source)
  }

  // ── Changing ──────────────────────────────────────────────────────────────────────────────────

  /** Rename, change a link's crawl settings (the address stays) or the OCR mode. */
  async update(
    ctx: KnowledgeContext,
    baseId: string,
    sourceId: string,
    input: UpdateKnowledgeSourceInput,
  ): Promise<KnowledgeSourceDto> {
    const row = await this.deps.db.tenant(ctx.orgId, async (tx) => {
      await this.deps.access.require(tx, ctx, baseId, 'manage')
      const current = await this.requireActive(tx, ctx.orgId, baseId, sourceId)
      const currentLink =
        current.config !== null && 'link' in current.config ? current.config.link : null
      if (input.link !== undefined && currentLink === null) {
        throw new KnowledgeSourceStateInvalidError('Only a link has crawl settings')
      }
      const link =
        currentLink === null || input.link === undefined
          ? currentLink
          : { ...currentLink, ...input.link }
      const refreshChanged = link !== null && link.refresh !== currentLink?.refresh
      const updated = await this.deps.sources.updateSource(tx, ctx.orgId, sourceId, {
        ...(input.name === undefined ? {} : { name: input.name }),
        ...(input.ocrMode === undefined ? {} : { ocrMode: input.ocrMode }),
        ...(link === null || input.link === undefined ? {} : { config: { version: 1, link } }),
        ...(refreshChanged
          ? {
              nextSyncAt: nextSyncAfter(
                link.refresh,
                current.lastSyncedAt ?? (this.deps.now ?? (() => new Date()))(),
              ),
            }
          : {}),
      })
      if (updated === undefined) throw new KnowledgeSourceNotFoundError()
      return updated
    })
    return this.dto(ctx.orgId, row)
  }

  /** Moves the source to Recently deleted; its passages stay, but are never searched. */
  async delete(ctx: KnowledgeContext, baseId: string, sourceId: string): Promise<void> {
    await this.deps.db.tenant(ctx.orgId, async (tx) => {
      await this.deps.access.require(tx, ctx, baseId, 'manage')
      const source = await this.requireActive(tx, ctx.orgId, baseId, sourceId)
      await this.softDelete(tx, ctx, source)
    })
  }

  /** Brings a deleted source back, searchable at once (its passages were kept). */
  async restore(
    ctx: KnowledgeContext,
    baseId: string,
    sourceId: string,
  ): Promise<KnowledgeSourceDto> {
    const row = await this.deps.db.tenant(ctx.orgId, async (tx) => {
      const { base } = await this.deps.access.require(tx, ctx, baseId, 'manage', {
        allowDeleted: true,
      })
      if (base.deletedAt !== null) throw new KnowledgeBaseDeletedError()
      const source = await this.requireSource(tx, ctx.orgId, baseId, sourceId)
      if (source.deletedAt === null) throw new KnowledgeSourceNotFoundError()
      const link = source.config !== null && 'link' in source.config ? source.config.link : null
      const restored = await this.deps.sources.restoreSource(
        tx,
        ctx.orgId,
        sourceId,
        link === null ? null : nextSyncAfter(link.refresh, (this.deps.now ?? (() => new Date()))()),
      )
      if (restored === undefined) throw new KnowledgeSourceNotFoundError()
      await this.deps.repository.recomputeCounters(tx, ctx.orgId, baseId)
      await this.deps.audit.record(tx, ctx, {
        action: KNOWLEDGE_AUDIT_ACTIONS.KNOWLEDGE_SOURCE_RESTORED,
        target: { type: 'knowledge_source', id: sourceId },
      })
      return restored
    })
    return this.dto(ctx.orgId, row)
  }

  /** Failed, partly failed or paused sources go back through ingestion; `withOcr` forces OCR. */
  async retry(
    ctx: KnowledgeContext,
    baseId: string,
    sourceId: string,
    input: RetryKnowledgeSourceInput,
  ): Promise<KnowledgeSourceDto> {
    const { row, documentIds, isLink } = await this.deps.db.tenant(ctx.orgId, async (tx) => {
      await this.deps.access.require(tx, ctx, baseId, 'manage')
      const source = await this.requireActive(tx, ctx.orgId, baseId, sourceId)
      if (!RETRYABLE.has(source.status)) {
        throw new KnowledgeSourceStateInvalidError('Only a failed or paused source can be retried')
      }
      const ids =
        source.type === 'link'
          ? []
          : await this.deps.ingestion.retryDocumentsInTx(
              tx,
              ctx.orgId,
              baseId,
              sourceId,
              input.withOcr,
            )
      const updated = await this.deps.sources.updateSource(tx, ctx.orgId, sourceId, {
        status: 'queued',
        progressPercent: 0,
        errorCode: null,
        ...(source.type === 'link' && input.withOcr ? { ocrMode: 'force' as const } : {}),
      })
      if (updated === undefined) throw new KnowledgeSourceNotFoundError()
      await this.deps.audit.record(tx, ctx, {
        action: KNOWLEDGE_AUDIT_ACTIONS.KNOWLEDGE_SOURCE_RETRIED,
        target: { type: 'knowledge_source', id: sourceId },
        metadata: { labels: { withOcr: input.withOcr } },
      })
      return { row: updated, documentIds: ids, isLink: source.type === 'link' }
    })
    if (isLink) await this.deps.ingestion.enqueueSync(ctx.orgId, sourceId)
    else await this.deps.ingestion.enqueueDocuments(ctx.orgId, documentIds)
    return this.dto(ctx.orgId, row)
  }

  /** "Sync now" for a link (a connector joins in V1): queued, and crawled at once. */
  async sync(ctx: KnowledgeContext, baseId: string, sourceId: string): Promise<KnowledgeSourceDto> {
    const row = await this.deps.db.tenant(ctx.orgId, async (tx) => {
      await this.deps.access.require(tx, ctx, baseId, 'manage')
      const source = await this.requireActive(tx, ctx.orgId, baseId, sourceId)
      if (source.type === 'file') {
        throw new KnowledgeSourceStateInvalidError('A file has nothing to sync')
      }
      if (ACTIVE_STATES.has(source.status)) {
        throw new KnowledgeSourceStateInvalidError('This source is already being processed')
      }
      const updated = await this.deps.sources.updateSource(tx, ctx.orgId, sourceId, {
        status: 'queued',
        errorCode: null,
        progressPercent: 0,
      })
      if (updated === undefined) throw new KnowledgeSourceNotFoundError()
      await this.deps.audit.record(tx, ctx, {
        action: KNOWLEDGE_AUDIT_ACTIONS.KNOWLEDGE_SOURCE_SYNCED,
        target: { type: 'knowledge_source', id: sourceId },
      })
      return updated
    })
    await this.deps.ingestion.enqueueSync(ctx.orgId, sourceId)
    return this.dto(ctx.orgId, row)
  }

  /** Sources tab bulk actions; sources that do not fit (removed, unknown) are skipped, not failed. */
  async bulk(
    ctx: KnowledgeContext,
    baseId: string,
    input: BulkKnowledgeSourcesInput,
  ): Promise<BulkKnowledgeSourcesResultDto> {
    const ids = [...new Set(input.sourceIds)]
    const result = await this.deps.db.tenant(ctx.orgId, async (tx) => {
      await this.deps.access.require(tx, ctx, baseId, 'manage')
      const active = (await this.deps.sources.findSources(tx, ctx.orgId, baseId, ids)).filter(
        (source) => source.deletedAt === null,
      )
      if (input.action === 'remove') {
        for (const source of active) await this.softDelete(tx, ctx, source)
        return { affected: active.length, documentIds: [] as string[] }
      }
      const documentIds = await this.deps.ingestion.resetDocumentsInTx(
        tx,
        ctx.orgId,
        baseId,
        active.map((source) => source.id),
      )
      return { affected: active.length, documentIds }
    })
    await this.deps.ingestion.enqueueDocuments(ctx.orgId, result.documentIds)
    return { affected: result.affected, skipped: ids.length - result.affected }
  }

  // ── Internals ─────────────────────────────────────────────────────────────────────────────────

  private async softDelete(
    tx: DbExecutor,
    ctx: KnowledgeContext,
    source: KnowledgeSourceRow,
  ): Promise<void> {
    await this.deps.sources.softDeleteSource(tx, ctx.orgId, source.id, ctx.userId)
    await this.deps.repository.recomputeCounters(tx, ctx.orgId, source.knowledgeBaseId)
    await this.deps.audit.record(tx, ctx, {
      action: KNOWLEDGE_AUDIT_ACTIONS.KNOWLEDGE_SOURCE_REMOVED,
      target: { type: 'knowledge_source', id: source.id },
    })
  }

  private async requireSource(
    tx: DbExecutor,
    orgId: string,
    baseId: string,
    sourceId: string,
  ): Promise<KnowledgeSourceRow> {
    const source = await this.deps.sources.findSource(tx, orgId, baseId, sourceId)
    if (source === undefined) throw new KnowledgeSourceNotFoundError()
    return source
  }

  /** A source that is not in Recently deleted. */
  private async requireActive(
    tx: DbExecutor,
    orgId: string,
    baseId: string,
    sourceId: string,
  ): Promise<KnowledgeSourceRow> {
    const source = await this.requireSource(tx, orgId, baseId, sourceId)
    if (source.deletedAt !== null) throw new KnowledgeSourceNotFoundError()
    return source
  }

  private async dto(orgId: string, row: KnowledgeSourceRow): Promise<KnowledgeSourceDto> {
    const [dto] = await this.dtos(orgId, [row])
    if (dto === undefined) throw new Error('source view returned no row')
    return dto
  }

  private async dtos(
    orgId: string,
    rows: readonly KnowledgeSourceRow[],
  ): Promise<KnowledgeSourceDto[]> {
    const stats = await this.deps.db.tenant(orgId, (tx) =>
      this.deps.sources.documentStats(
        tx,
        orgId,
        rows.map((row) => row.id),
      ),
    )
    const people = await this.deps.users.findUserRefs(
      rows.flatMap((row) => (row.addedByUserId === null ? [] : [row.addedByUserId])),
    )
    return rows.map((row) => toSourceDto(row, stats.get(row.id), people))
  }
}
