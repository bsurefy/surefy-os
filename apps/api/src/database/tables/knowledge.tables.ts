// SPDX-License-Identifier: AGPL-3.0-only
import { sql } from 'drizzle-orm'
import {
  bigint,
  boolean,
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  smallint,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'

import {
  EMBEDDING_DIMENSIONS,
  KNOWLEDGE_ACCESS_LEVELS,
  KNOWLEDGE_ACCESS_SUBJECT_TYPES,
  KNOWLEDGE_CHUNKING_PRESETS,
  KNOWLEDGE_DOCUMENT_STATUSES,
  KNOWLEDGE_OCR_MODES,
  KNOWLEDGE_SOURCE_STATUSES,
  KNOWLEDGE_SOURCE_TYPES,
} from '@surefy/contracts'
import type {
  KnowledgeAccessLevel,
  KnowledgeAccessSubjectType,
  KnowledgeChunkingPreset,
  KnowledgeDocumentStatus,
  KnowledgeOcrMode,
  KnowledgeSourceConfig,
  KnowledgeSourceStatus,
  KnowledgeSourceType,
} from '@surefy/contracts'

import { users } from './auth.tables.js'
import { organizationMembers, organizations } from './organizations.tables.js'
import { teams } from './teams.tables.js'
import { enumCheck } from '../checks.js'
import { createdBy, id, orgId, softDelete, timestamps } from '../columns.js'
import { bytea, tsvector, vector } from '../columnTypes.js'
import { tenantPolicy } from '../policies.js'

// Knowledge (database/knowledge.md, §1–5): bases with their embedding model, who may search or
// manage them, their sources, the documents each source yields and the embedded passages. The
// partial HNSW indexes of `knowledge_chunks` and FORCE RLS are in the knowledge security migration.
// Agent subjects (`knowledge_base_access.agent_id`) and connector sources (`connection_id` with its
// foreign key) join the tables with the agents and connections modules (V1).

export const knowledgeBases = pgTable(
  'knowledge_bases',
  {
    id: id(),
    organizationId: orgId(organizations),
    name: text().notNull(),
    description: text(),
    isLocalOnly: boolean().notNull().default(false),
    chunkingPreset: text().$type<KnowledgeChunkingPreset>().notNull().default('default'),
    /** The active embedding model (`vault_models.model_key`); null disables uploads. */
    embeddingModelKey: text(),
    /** The target model while re-embedding; null otherwise. */
    pendingEmbeddingModelKey: text(),
    sourceCount: integer().notNull().default(0),
    documentCount: integer().notNull().default(0),
    chunkCount: integer().notNull().default(0),
    ...createdBy(users),
    ...softDelete(users),
    ...timestamps(),
  },
  (t) => [
    unique('knowledge_bases_organization_id_id_key').on(t.organizationId, t.id),
    uniqueIndex('knowledge_bases_organization_id_name_key')
      .on(t.organizationId, sql`lower(${t.name})`)
      .where(sql`${t.deletedAt} is null`),
    index('knowledge_bases_organization_id_deleted_at_idx')
      .on(t.organizationId, t.deletedAt.desc())
      .where(sql`${t.deletedAt} is not null`),
    index('knowledge_bases_deleted_at_idx')
      .on(t.deletedAt)
      .where(sql`${t.deletedAt} is not null`),
    index('knowledge_bases_organization_id_pending_idx')
      .on(t.organizationId)
      .where(sql`${t.pendingEmbeddingModelKey} is not null`),
    index('knowledge_bases_created_by_user_id_idx')
      .on(t.createdByUserId)
      .where(sql`${t.createdByUserId} is not null`),
    enumCheck(
      'knowledge_bases_chunking_preset_check',
      t.chunkingPreset,
      KNOWLEDGE_CHUNKING_PRESETS,
    ),
    check(
      'knowledge_bases_pending_check',
      sql`${t.pendingEmbeddingModelKey} is null or ${t.pendingEmbeddingModelKey} <> ${t.embeddingModelKey}`,
    ),
    tenantPolicy('knowledge_bases', t.organizationId),
  ],
)

/** Rows only grant; "No access" is the absence of a row. */
export const knowledgeBaseAccess = pgTable(
  'knowledge_base_access',
  {
    id: id(),
    organizationId: orgId(organizations),
    knowledgeBaseId: uuid().notNull(),
    subjectType: text().$type<KnowledgeAccessSubjectType>().notNull(),
    teamId: uuid(),
    userId: uuid(),
    level: text().$type<KnowledgeAccessLevel>().notNull(),
    ...createdBy(users),
    ...timestamps(),
  },
  (t) => [
    unique('knowledge_base_access_organization_id_id_key').on(t.organizationId, t.id),
    unique('knowledge_base_access_subject_key')
      .on(t.organizationId, t.knowledgeBaseId, t.subjectType, t.teamId, t.userId)
      .nullsNotDistinct(),
    foreignKey({
      name: 'knowledge_base_access_organization_id_knowledge_base_id_fkey',
      columns: [t.organizationId, t.knowledgeBaseId],
      foreignColumns: [knowledgeBases.organizationId, knowledgeBases.id],
    }).onDelete('cascade'),
    foreignKey({
      name: 'knowledge_base_access_organization_id_team_id_fkey',
      columns: [t.organizationId, t.teamId],
      foreignColumns: [teams.organizationId, teams.id],
    }).onDelete('cascade'),
    foreignKey({
      name: 'knowledge_base_access_organization_id_user_id_fkey',
      columns: [t.organizationId, t.userId],
      foreignColumns: [organizationMembers.organizationId, organizationMembers.userId],
    }).onDelete('cascade'),
    index('knowledge_base_access_organization_id_team_id_idx')
      .on(t.organizationId, t.teamId)
      .where(sql`${t.teamId} is not null`),
    index('knowledge_base_access_organization_id_user_id_idx')
      .on(t.organizationId, t.userId)
      .where(sql`${t.userId} is not null`),
    enumCheck(
      'knowledge_base_access_subject_type_check',
      t.subjectType,
      KNOWLEDGE_ACCESS_SUBJECT_TYPES,
    ),
    enumCheck('knowledge_base_access_level_check', t.level, KNOWLEDGE_ACCESS_LEVELS),
    check(
      'knowledge_base_access_subject_check',
      sql`(${t.subjectType} = 'team' and ${t.teamId} is not null and ${t.userId} is null)
        or (${t.subjectType} = 'user' and ${t.userId} is not null and ${t.teamId} is null)`,
    ),
    tenantPolicy('knowledge_base_access', t.organizationId),
  ],
)

/** An uploaded file, a crawled link, or (V1) a set of connector folders. */
export const knowledgeSources = pgTable(
  'knowledge_sources',
  {
    id: id(),
    organizationId: orgId(organizations),
    knowledgeBaseId: uuid().notNull(),
    type: text().$type<KnowledgeSourceType>().notNull(),
    name: text().notNull(),
    /** Connector sources (V1); the foreign key to `connections` joins with that table. */
    connectionId: uuid(),
    config: jsonb().$type<KnowledgeSourceConfig>(),
    fileName: text(),
    contentType: text(),
    sizeBytes: bigint({ mode: 'number' }),
    sha256: bytea(),
    ocrMode: text().$type<KnowledgeOcrMode>().notNull().default('auto'),
    status: text().$type<KnowledgeSourceStatus>().notNull(),
    progressPercent: smallint().notNull().default(0),
    errorCode: text(),
    lastSyncedAt: timestamp({ withTimezone: true }),
    nextSyncAt: timestamp({ withTimezone: true }),
    addedByUserId: uuid().references(() => users.id, { onDelete: 'set null' }),
    ...softDelete(users),
    ...timestamps(),
  },
  (t) => [
    unique('knowledge_sources_organization_id_id_key').on(t.organizationId, t.id),
    foreignKey({
      name: 'knowledge_sources_organization_id_knowledge_base_id_fkey',
      columns: [t.organizationId, t.knowledgeBaseId],
      foreignColumns: [knowledgeBases.organizationId, knowledgeBases.id],
    }).onDelete('cascade'),
    index('knowledge_sources_organization_id_knowledge_base_id_created_at_idx').on(
      t.organizationId,
      t.knowledgeBaseId,
      t.createdAt.desc(),
      t.id,
    ),
    index('knowledge_sources_organization_id_sha256_idx')
      .on(t.organizationId, t.sha256)
      .where(sql`${t.type} = 'file' and ${t.deletedAt} is null`),
    index('knowledge_sources_organization_id_knowledge_base_id_deleted_at_idx')
      .on(t.organizationId, t.knowledgeBaseId, t.deletedAt.desc())
      .where(sql`${t.deletedAt} is not null`),
    index('knowledge_sources_next_sync_at_idx')
      .on(t.nextSyncAt)
      .where(sql`${t.nextSyncAt} is not null and ${t.deletedAt} is null`),
    index('knowledge_sources_organization_id_status_idx')
      .on(t.organizationId, t.status)
      .where(sql`${t.deletedAt} is null and ${t.status} <> 'ready'`),
    index('knowledge_sources_organization_id_connection_id_idx')
      .on(t.organizationId, t.connectionId)
      .where(sql`${t.connectionId} is not null`),
    index('knowledge_sources_deleted_at_idx')
      .on(t.deletedAt)
      .where(sql`${t.deletedAt} is not null`),
    index('knowledge_sources_added_by_user_id_idx')
      .on(t.addedByUserId)
      .where(sql`${t.addedByUserId} is not null`),
    enumCheck('knowledge_sources_type_check', t.type, KNOWLEDGE_SOURCE_TYPES),
    enumCheck('knowledge_sources_ocr_mode_check', t.ocrMode, KNOWLEDGE_OCR_MODES),
    enumCheck('knowledge_sources_status_check', t.status, KNOWLEDGE_SOURCE_STATUSES),
    check('knowledge_sources_progress_percent_check', sql`${t.progressPercent} between 0 and 100`),
    check(
      'knowledge_sources_type_fields_check',
      sql`(${t.type} = 'file' and ${t.fileName} is not null and ${t.sizeBytes} is not null
          and ${t.sha256} is not null and ${t.connectionId} is null)
        or (${t.type} = 'connector' and ${t.connectionId} is not null)
        or (${t.type} = 'link' and ${t.connectionId} is null)`,
    ),
    tenantPolicy('knowledge_sources', t.organizationId),
  ],
)

/** The uploaded file itself, one crawled page, or one connector file or page. */
export const knowledgeDocuments = pgTable(
  'knowledge_documents',
  {
    id: id(),
    organizationId: orgId(organizations),
    /** Copied from the source. */
    knowledgeBaseId: uuid().notNull(),
    sourceId: uuid().notNull(),
    /** `file` for file sources; the canonical URL for links; the remote id for connectors. */
    externalRef: text().notNull(),
    title: text().notNull(),
    mimeType: text(),
    sizeBytes: bigint({ mode: 'number' }),
    pageCount: integer(),
    /** Hex SHA-256 of the fetched bytes, or the remote revision id. */
    contentHash: text(),
    objectKey: text(),
    parsedObjectKey: text(),
    status: text().$type<KnowledgeDocumentStatus>().notNull().default('pending'),
    errorCode: text(),
    /** The model of the document's latest complete chunk set. */
    embeddingModelKey: text(),
    chunkCount: integer().notNull().default(0),
    citationCount: integer().notNull().default(0),
    indexedAt: timestamp({ withTimezone: true }),
    ...timestamps(),
  },
  (t) => [
    unique('knowledge_documents_organization_id_id_key').on(t.organizationId, t.id),
    unique('knowledge_documents_organization_id_source_id_external_ref_key').on(
      t.organizationId,
      t.sourceId,
      t.externalRef,
    ),
    foreignKey({
      name: 'knowledge_documents_organization_id_knowledge_base_id_fkey',
      columns: [t.organizationId, t.knowledgeBaseId],
      foreignColumns: [knowledgeBases.organizationId, knowledgeBases.id],
    }).onDelete('cascade'),
    foreignKey({
      name: 'knowledge_documents_organization_id_source_id_fkey',
      columns: [t.organizationId, t.sourceId],
      foreignColumns: [knowledgeSources.organizationId, knowledgeSources.id],
    }).onDelete('cascade'),
    index('knowledge_documents_organization_id_knowledge_base_id_status_idx')
      .on(t.organizationId, t.knowledgeBaseId, t.status)
      .where(sql`${t.status} <> 'ready'`),
    index('knowledge_documents_organization_id_knowledge_base_id_embedding_model_key_idx').on(
      t.organizationId,
      t.knowledgeBaseId,
      t.embeddingModelKey,
    ),
    enumCheck('knowledge_documents_status_check', t.status, KNOWLEDGE_DOCUMENT_STATUSES),
    tenantPolicy('knowledge_documents', t.organizationId),
  ],
)

/**
 * One embedded passage. Nothing references chunks by foreign key and `knowledge_base_id` and
 * `source_id` are copied from the document without one: the table is the largest, and the
 * document's cascade removes its chunks. Written only by the ingestion and re-embedding jobs.
 */
export const knowledgeChunks = pgTable(
  'knowledge_chunks',
  {
    id: id(),
    organizationId: orgId(organizations),
    knowledgeBaseId: uuid().notNull(),
    sourceId: uuid().notNull(),
    documentId: uuid().notNull(),
    ordinal: integer().notNull(),
    content: text().notNull(),
    pageFrom: integer(),
    pageTo: integer(),
    headingPath: text().array(),
    tokenCount: integer().notNull(),
    /** Unconstrained dimensions; `embedding_dimensions` routes the row to its partial index. */
    embedding: vector().notNull(),
    embeddingModel: text().notNull(),
    embeddingDimensions: smallint()
      .notNull()
      .generatedAlwaysAs(sql`vector_dims(embedding)`),
    contentTsv: tsvector()
      .notNull()
      .generatedAlwaysAs(sql`to_tsvector('simple', content)`),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    foreignKey({
      name: 'knowledge_chunks_organization_id_document_id_fkey',
      columns: [t.organizationId, t.documentId],
      foreignColumns: [knowledgeDocuments.organizationId, knowledgeDocuments.id],
    }).onDelete('cascade'),
    unique('knowledge_chunks_organization_id_document_id_embedding_model_ordinal_key').on(
      t.organizationId,
      t.documentId,
      t.embeddingModel,
      t.ordinal,
    ),
    index('knowledge_chunks_organization_id_knowledge_base_id_embedding_model_idx').on(
      t.organizationId,
      t.knowledgeBaseId,
      t.embeddingModel,
    ),
    index('knowledge_chunks_content_tsv_idx').using('gin', t.contentTsv),
    check(
      'knowledge_chunks_embedding_dimensions_check',
      sql`${t.embeddingDimensions} in (${sql.raw(EMBEDDING_DIMENSIONS.join(', '))})`,
    ),
    tenantPolicy('knowledge_chunks', t.organizationId),
  ],
)
