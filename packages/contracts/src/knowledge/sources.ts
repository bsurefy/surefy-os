// SPDX-License-Identifier: AGPL-3.0-only
import { z } from 'zod'

import { KNOWLEDGE_FAILURE_CODES } from './errors.js'
import { userRefDtoSchema } from '../auth/schemas.js'
import { multiValueQuery, searchQuery } from '../core/filters.js'
import { pageQuery, sortQuery } from '../core/pagination.js'
import { downloadLinkDtoSchema } from '../dataControl/schemas.js'
import { teamRefDtoSchema } from '../teams/schemas.js'

// Sources, documents and previews (database/knowledge.md §3–4, ingestion status flow, duplicate
// detection; Knowledge › base detail › Sources, Source preview). Routes, under
// /api/v1/orgs/:orgId/knowledge-bases/:baseId:
// GET /sources · POST /sources/files · POST /sources/links · POST /sources/bulk ·
// GET/PATCH/DELETE /sources/:sourceId · POST /sources/:sourceId/{complete,retry,sync,restore} ·
// GET /sources/:sourceId/documents · GET /documents/:documentId ·
// GET /documents/:documentId/pages · POST /documents/:documentId/download.
// Connector sources (Google Drive, Notion) are created by the V1 connection flow; the MVP reads
// and manages them like any other source.

export const KNOWLEDGE_SOURCE_TYPES = ['file', 'link', 'connector'] as const
export type KnowledgeSourceType = (typeof KNOWLEDGE_SOURCE_TYPES)[number]

/**
 * File: `uploading → queued → processing → ready | partially_failed | failed`. Link and connector:
 * `queued → …`. Resync and retry go back to `queued`; an expired connector sign-in `paused`s the
 * source until Reconnect. Derived from the documents when processing ends.
 */
export const KNOWLEDGE_SOURCE_STATUSES = [
  'uploading',
  'queued',
  'processing',
  'ready',
  'partially_failed',
  'failed',
  'paused',
] as const
export type KnowledgeSourceStatus = (typeof KNOWLEDGE_SOURCE_STATUSES)[number]

/** Statuses that count as "Needs attention" in the KPIs and behind "Show failed". */
export const KNOWLEDGE_ATTENTION_STATUSES = ['partially_failed', 'failed', 'paused'] as const

/** `pending → parsing → embedding → ready`; `→ failed`; Retry and re-index go back to `pending`. */
export const KNOWLEDGE_DOCUMENT_STATUSES = [
  'pending',
  'parsing',
  'embedding',
  'ready',
  'failed',
] as const
export type KnowledgeDocumentStatus = (typeof KNOWLEDGE_DOCUMENT_STATUSES)[number]

/** `force` is "Retry with OCR"; `off` skips OCR for scans. */
export const KNOWLEDGE_OCR_MODES = ['auto', 'force', 'off'] as const
export type KnowledgeOcrMode = (typeof KNOWLEDGE_OCR_MODES)[number]

export const KNOWLEDGE_RESTORE_WINDOW_DAYS = 30

const MIB = 1024 * 1024

/** The limits the dropzone states up front and the API enforces; the type is verified from the bytes. */
export const KNOWLEDGE_FILE_LIMITS = {
  maxBytes: 100 * MIB,
  /** Files in one bulk or drop action. */
  maxFilesPerDrop: 50,
} as const

/** Accepted types: PDF, DOCX, XLSX, CSV, PPTX, TXT, MD, HTML and images (OCR). */
export const KNOWLEDGE_FILE_TYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/csv',
  'text/plain',
  'text/markdown',
  'text/html',
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/tiff',
] as const
export type KnowledgeFileType = (typeof KNOWLEDGE_FILE_TYPES)[number]

// ── Source configuration ────────────────────────────────────────────────────────────────────────

export const KNOWLEDGE_LINK_REFRESH = ['off', 'daily', 'weekly', 'monthly'] as const
export type KnowledgeLinkRefresh = (typeof KNOWLEDGE_LINK_REFRESH)[number]

export const KNOWLEDGE_CRAWL_DEPTH_MAX = 3
export const KNOWLEDGE_PATH_RULES_MAX = 20

const pathRuleSchema = z.string().trim().min(1).max(200)

/** A link source: one page (`crawlDepth` 0) or a crawl of the same site. */
export const knowledgeLinkConfigSchema = z.object({
  url: z.url().max(2000),
  crawlDepth: z.number().int().min(0).max(KNOWLEDGE_CRAWL_DEPTH_MAX),
  includePaths: z.array(pathRuleSchema).max(KNOWLEDGE_PATH_RULES_MAX),
  excludePaths: z.array(pathRuleSchema).max(KNOWLEDGE_PATH_RULES_MAX),
  refresh: z.enum(KNOWLEDGE_LINK_REFRESH),
})
export type KnowledgeLinkConfig = z.infer<typeof knowledgeLinkConfigSchema>

export const KNOWLEDGE_CONNECTOR_PROVIDERS = ['google_drive', 'notion'] as const
export const KNOWLEDGE_CONNECTOR_SYNC_EVERY = ['hourly', 'daily'] as const
export const KNOWLEDGE_CONNECTOR_FOLDERS_MAX = 100

export const knowledgeConnectorConfigSchema = z.object({
  provider: z.enum(KNOWLEDGE_CONNECTOR_PROVIDERS),
  folders: z
    .array(z.object({ externalId: z.string().min(1).max(200), name: z.string().min(1).max(300) }))
    .max(KNOWLEDGE_CONNECTOR_FOLDERS_MAX),
  syncEvery: z.enum(KNOWLEDGE_CONNECTOR_SYNC_EVERY),
})
export type KnowledgeConnectorConfig = z.infer<typeof knowledgeConnectorConfigSchema>

/** `knowledge_sources.config` v1: exactly one of `link` and `connector`, matching the source's type. */
export const knowledgeSourceConfigSchema = z.union([
  z.object({ version: z.literal(1), link: knowledgeLinkConfigSchema }),
  z.object({ version: z.literal(1), connector: knowledgeConnectorConfigSchema }),
])
export type KnowledgeSourceConfig = z.infer<typeof knowledgeSourceConfigSchema>

// ── Sources ─────────────────────────────────────────────────────────────────────────────────────

/** `knowledge_sources`: one row of the Sources tab. */
export const knowledgeSourceDtoSchema = z.object({
  id: z.uuid(),
  knowledgeBaseId: z.uuid(),
  type: z.enum(KNOWLEDGE_SOURCE_TYPES),
  /** File name, link title or connector label. */
  name: z.string(),
  /** File sources. */
  fileName: z.string().nullable(),
  contentType: z.string().nullable(),
  sizeBytes: z.number().int().nonnegative().nullable(),
  /** Link and connector sources; at most one is set, matching `type`. */
  link: knowledgeLinkConfigSchema.nullable(),
  connector: knowledgeConnectorConfigSchema.nullable(),
  ocrMode: z.enum(KNOWLEDGE_OCR_MODES),
  status: z.enum(KNOWLEDGE_SOURCE_STATUSES),
  /** Upload 0–100 while `uploading`, then parse and embed progress; for links the share of finished documents. */
  progressPercent: z.number().int().min(0).max(100),
  /** The source-level reason, one of `KNOWLEDGE_FAILURE_CODES`; per-document reasons are on the documents. */
  errorCode: z.enum(KNOWLEDGE_FAILURE_CODES).nullable(),
  documentCount: z.number().int().nonnegative(),
  failedDocumentCount: z.number().int().nonnegative(),
  /** Searchable passages of the base's active embedding model. */
  passageCount: z.number().int().nonnegative(),
  lastSyncedAt: z.iso.datetime().nullable(),
  /** Null while paused and for files. */
  nextSyncAt: z.iso.datetime().nullable(),
  addedBy: userRefDtoSchema.nullable(),
  /** Set while the source waits in Recently deleted. */
  deletedAt: z.iso.datetime().nullable(),
  purgeAt: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
})
export type KnowledgeSourceDto = z.infer<typeof knowledgeSourceDtoSchema>

export const KNOWLEDGE_SOURCE_LIST_STATES = ['active', 'deleted'] as const
export const KNOWLEDGE_SOURCE_SORT_FIELDS = ['createdAt', 'name', 'sizeBytes'] as const

/** `GET …/sources`: newest first by default; `state=deleted` is the base's sources in Recently deleted. */
export const listKnowledgeSourcesQuerySchema = pageQuery.extend({
  q: searchQuery,
  type: multiValueQuery(z.enum(KNOWLEDGE_SOURCE_TYPES)),
  status: multiValueQuery(z.enum(KNOWLEDGE_SOURCE_STATUSES)),
  state: z.enum(KNOWLEDGE_SOURCE_LIST_STATES).default('active'),
  sort: sortQuery(KNOWLEDGE_SOURCE_SORT_FIELDS),
})
export type ListKnowledgeSourcesQuery = z.infer<typeof listKnowledgeSourcesQuerySchema>

/** What to do when the same bytes are already in the base: refuse, soft-delete the old source, or add both. */
export const KNOWLEDGE_DUPLICATE_ACTIONS = ['reject', 'replace', 'keep_both'] as const
export type KnowledgeDuplicateAction = (typeof KNOWLEDGE_DUPLICATE_ACTIONS)[number]

/**
 * `POST …/sources/files`: the browser sends the SHA-256 it computed (hex). The type and size are
 * checked before a row or an upload URL exists. A match in the same base answers
 * `409 KNOWLEDGE_DUPLICATE_FILE` with `knowledgeDuplicateFileDetailsSchema` unless `duplicate`
 * says `replace` (one transaction: the old source is soft-deleted, so it is restorable) or `keep_both`.
 */
export const requestKnowledgeFileUploadInputSchema = z.object({
  fileName: z.string().trim().min(1).max(255),
  contentType: z.enum(KNOWLEDGE_FILE_TYPES),
  sizeBytes: z.number().int().positive().max(KNOWLEDGE_FILE_LIMITS.maxBytes),
  sha256: z.string().regex(/^[0-9a-f]{64}$/),
  ocrMode: z.enum(KNOWLEDGE_OCR_MODES).default('auto'),
  duplicate: z.enum(KNOWLEDGE_DUPLICATE_ACTIONS).default('reject'),
})
export type RequestKnowledgeFileUploadInput = z.infer<typeof requestKnowledgeFileUploadInputSchema>

/** The short-lived signed upload; the bytes go straight to object storage, then `…/complete` is called. */
export const knowledgeFileUploadDtoSchema = z.object({
  source: knowledgeSourceDtoSchema,
  upload: z.object({
    url: z.url(),
    method: z.literal('PUT'),
    headers: z.record(z.string(), z.string()),
    expiresAt: z.iso.datetime(),
  }),
})
export type KnowledgeFileUploadDto = z.infer<typeof knowledgeFileUploadDtoSchema>

/** The `details` entry of a `KNOWLEDGE_DUPLICATE_FILE` error: what the "Replace / Keep both" prompt names. */
export const knowledgeDuplicateFileDetailsSchema = z.object({
  existingSource: z.object({ id: z.uuid(), name: z.string(), createdAt: z.iso.datetime() }),
})
export type KnowledgeDuplicateFileDetails = z.infer<typeof knowledgeDuplicateFileDetailsSchema>

/** `POST …/sources/links`: the title defaults to the page title found by the first crawl. */
export const createKnowledgeLinkInputSchema = knowledgeLinkConfigSchema.extend({
  name: z.string().trim().min(1).max(200).optional(),
})
export type CreateKnowledgeLinkInput = z.infer<typeof createKnowledgeLinkInputSchema>

/** `PATCH …/sources/:sourceId`: rename, change a link's crawl settings (the address stays), or the OCR mode. */
export const updateKnowledgeSourceInputSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  link: knowledgeLinkConfigSchema.omit({ url: true }).partial().optional(),
  ocrMode: z.enum(KNOWLEDGE_OCR_MODES).optional(),
})
export type UpdateKnowledgeSourceInput = z.infer<typeof updateKnowledgeSourceInputSchema>

/** `POST …/sources/:sourceId/retry` (failed, partially failed or paused sources): `withOcr` is "Retry with OCR". */
export const retryKnowledgeSourceInputSchema = z.object({
  withOcr: z.boolean().default(false),
})
export type RetryKnowledgeSourceInput = z.infer<typeof retryKnowledgeSourceInputSchema>

export const KNOWLEDGE_BULK_ACTIONS = ['reindex', 'remove'] as const
export const KNOWLEDGE_BULK_SOURCES_MAX = 100

/** `POST …/sources/bulk`: Sources tab bulk actions; removing is T2 like removing one source. */
export const bulkKnowledgeSourcesInputSchema = z.object({
  action: z.enum(KNOWLEDGE_BULK_ACTIONS),
  sourceIds: z.array(z.uuid()).min(1).max(KNOWLEDGE_BULK_SOURCES_MAX),
})
export type BulkKnowledgeSourcesInput = z.infer<typeof bulkKnowledgeSourcesInputSchema>

/** Sources that did not fit the action (already removed, wrong state) are skipped, not failed. */
export const bulkKnowledgeSourcesResultDtoSchema = z.object({
  affected: z.number().int().nonnegative(),
  skipped: z.number().int().nonnegative(),
})
export type BulkKnowledgeSourcesResultDto = z.infer<typeof bulkKnowledgeSourcesResultDtoSchema>

// ── Documents and preview ───────────────────────────────────────────────────────────────────────

/** `knowledge_documents`: the file itself, one crawled page, or one connector file or page. */
export const knowledgeDocumentDtoSchema = z.object({
  id: z.uuid(),
  knowledgeBaseId: z.uuid(),
  sourceId: z.uuid(),
  title: z.string(),
  mimeType: z.string().nullable(),
  sizeBytes: z.number().int().nonnegative().nullable(),
  pageCount: z.number().int().positive().nullable(),
  status: z.enum(KNOWLEDGE_DOCUMENT_STATUSES),
  /** The reason a `failed` document shows beside Retry, Retry with OCR or Remove. */
  errorCode: z.enum(KNOWLEDGE_FAILURE_CODES).nullable(),
  chunkCount: z.number().int().nonnegative(),
  /** "Used in answers N times". */
  citationCount: z.number().int().nonnegative(),
  indexedAt: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
})
export type KnowledgeDocumentDto = z.infer<typeof knowledgeDocumentDtoSchema>

export const KNOWLEDGE_DOCUMENT_SORT_FIELDS = ['title', 'createdAt'] as const

/** `GET …/sources/:sourceId/documents`: the pages of a link, the files of a connector, behind "Show failed". */
export const listKnowledgeDocumentsQuerySchema = pageQuery.extend({
  q: searchQuery,
  status: multiValueQuery(z.enum(KNOWLEDGE_DOCUMENT_STATUSES)),
  sort: sortQuery(KNOWLEDGE_DOCUMENT_SORT_FIELDS),
})
export type ListKnowledgeDocumentsQuery = z.infer<typeof listKnowledgeDocumentsQuerySchema>

/** `GET …/documents/:documentId`: the Source preview sheet's header. */
export const knowledgeDocumentDetailDtoSchema = z.object({
  document: knowledgeDocumentDtoSchema,
  source: z.object({ id: z.uuid(), name: z.string(), type: z.enum(KNOWLEDGE_SOURCE_TYPES) }),
  /** "Who can search": teams with a grant on the base, and people with their own grant. */
  whoCanSearch: z.object({
    teams: z.array(teamRefDtoSchema),
    userCount: z.number().int().nonnegative(),
  }),
  /** Download is offered only when the caller may manage the base and the original file is kept. */
  canDownload: z.boolean(),
})
export type KnowledgeDocumentDetailDto = z.infer<typeof knowledgeDocumentDetailDtoSchema>

/** A passage's span inside its page text, for the boundaries shown on hover and focus. */
export const knowledgePassageSpanSchema = z.object({
  chunkId: z.uuid(),
  ordinal: z.number().int().nonnegative(),
  /** Character offsets into `text`, end exclusive. */
  start: z.number().int().nonnegative(),
  end: z.number().int().nonnegative(),
})
export type KnowledgePassageSpan = z.infer<typeof knowledgePassageSpanSchema>

/** One page of extracted text; `page` is null for documents without pages (web pages, plain text). */
export const knowledgeDocumentPageDtoSchema = z.object({
  page: z.number().int().min(1).nullable(),
  text: z.string(),
  passages: z.array(knowledgePassageSpanSchema),
})
export type KnowledgeDocumentPageDto = z.infer<typeof knowledgeDocumentPageDtoSchema>

/** `GET …/documents/:documentId/pages`: in page order, a few pages at a time. */
export const listKnowledgeDocumentPagesQuerySchema = pageQuery
export type ListKnowledgeDocumentPagesQuery = z.infer<typeof listKnowledgeDocumentPagesQuerySchema>

/** `POST …/documents/:documentId/download`: a signed link issued on click; each download is audited. */
export const knowledgeDocumentDownloadDtoSchema = downloadLinkDtoSchema
