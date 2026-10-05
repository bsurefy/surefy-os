// SPDX-License-Identifier: AGPL-3.0-only
import { sql } from 'drizzle-orm'
import {
  bigint,
  boolean,
  char,
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'

import {
  CHAT_ATTACHMENT_KINDS,
  CHAT_ATTACHMENT_STATUSES,
  CHAT_FEEDBACK_RATINGS,
  CHAT_KNOWLEDGE_SCOPES,
  CHAT_MESSAGE_ROLES,
  CHAT_MESSAGE_STATUSES,
  DATA_LOCATIONS,
} from '@surefy/contracts'
import type {
  ChatAttachmentKind,
  ChatAttachmentStatus,
  ChatFeedbackRating,
  ChatKnowledgeScope,
  ChatMessageParts,
  ChatMessageRole,
  ChatMessageStatus,
  DataLocation,
} from '@surefy/contracts'

import { users } from './auth.tables.js'
import { organizations } from './organizations.tables.js'
import { vaultModels } from './vault.tables.js'
import { enumCheck } from '../checks.js'
import { id, orgId, softDelete, timestamps } from '../columns.js'
import { bytea, tsvector } from '../columnTypes.js'
import { tenantPolicy } from '../policies.js'

// Chat (database/chat.md, §1–7): folders, chats and their knowledge scope, messages with their
// structured parts, citations, answer feedback and attachments. Shares and the prompt library
// (§8–10) arrive with V1. Until the knowledge tables exist (B3-03), `chat_knowledge_bases` and
// `chat_message_citations` hold the knowledge ids without foreign keys; B3-03's migration adds
// them. `agent_id` and `agent_run_id` are plain columns until Agents (V1).

export const VARIANT_LABELS = ['a', 'b'] as const

/** A folder in one person's chat list. Deleting a folder returns its chats to the list. */
export const chatFolders = pgTable(
  'chat_folders',
  {
    id: id(),
    organizationId: orgId(organizations),
    ownerUserId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: text().notNull(),
    sortOrder: integer().notNull().default(0),
    ...timestamps(),
  },
  (t) => [
    unique('chat_folders_organization_id_id_key').on(t.organizationId, t.id),
    uniqueIndex('chat_folders_organization_id_owner_user_id_name_key').on(
      t.organizationId,
      t.ownerUserId,
      sql`lower(${t.name})`,
    ),
    index('chat_folders_owner_user_id_idx').on(t.ownerUserId),
    tenantPolicy('chat_folders', t.organizationId),
  ],
)

/** One conversation of one person with a model or an agent; soft delete, restorable for 30 days. */
export const chats = pgTable(
  'chats',
  {
    id: id(),
    organizationId: orgId(organizations),
    ownerUserId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** Empty until the first answer generates one. */
    title: text().notNull().default(''),
    /** True while the title is model-generated; a manual rename sets it to false. */
    titleGenerated: boolean().notNull().default(false),
    folderId: uuid().references(() => chatFolders.id, { onDelete: 'set null' }),
    isPinned: boolean().notNull().default(false),
    pinnedAt: timestamp({ withTimezone: true }),
    /** Local models only; excluded from Train and sharing. */
    isPrivate: boolean().notNull().default(false),
    /** V1: → agents (set null). */
    agentId: uuid(),
    knowledgeScope: text().$type<ChatKnowledgeScope>().notNull().default('all'),
    /** The model picked for the next message; `auto` with routing (V2). */
    currentModelKey: text(),
    lastMessageAt: timestamp({ withTimezone: true }),
    /** Not superseded messages; maintained in the message transaction. */
    messageCount: integer().notNull().default(0),
    titleTsv: tsvector().generatedAlwaysAs(sql`to_tsvector('simple', title)`),
    ...softDelete(users),
    ...timestamps(),
  },
  (t) => [
    unique('chats_organization_id_id_key').on(t.organizationId, t.id),
    check('chats_pinned_check', sql`${t.isPinned} = (${t.pinnedAt} is not null)`),
    check('chats_deleted_check', sql`${t.deletedByUserId} is null or ${t.deletedAt} is not null`),
    enumCheck('chats_knowledge_scope_check', t.knowledgeScope, CHAT_KNOWLEDGE_SCOPES),
    index('chats_organization_id_owner_user_id_last_message_at_idx')
      .on(t.organizationId, t.ownerUserId, t.lastMessageAt.desc().nullsLast(), t.id.desc())
      .where(sql`${t.deletedAt} is null`),
    index('chats_organization_id_owner_user_id_deleted_at_idx')
      .on(t.organizationId, t.ownerUserId, t.deletedAt.desc())
      .where(sql`${t.deletedAt} is not null`),
    index('chats_organization_id_owner_user_id_pinned_at_idx')
      .on(t.organizationId, t.ownerUserId, t.pinnedAt.desc())
      .where(sql`${t.isPinned} and ${t.deletedAt} is null`),
    index('chats_organization_id_folder_id_idx')
      .on(t.organizationId, t.folderId)
      .where(sql`${t.folderId} is not null`),
    index('chats_agent_id_idx')
      .on(t.agentId)
      .where(sql`${t.agentId} is not null`),
    index('chats_deleted_by_user_id_idx')
      .on(t.deletedByUserId)
      .where(sql`${t.deletedByUserId} is not null`),
    index('chats_title_tsv_idx').using('gin', t.titleTsv),
    index('chats_deleted_at_idx')
      .on(t.deletedAt)
      .where(sql`${t.deletedAt} is not null`),
    tenantPolicy('chats', t.organizationId),
  ],
)

/** The knowledge bases picked in a chat's knowledge scope popover (scope `selected`). */
export const chatKnowledgeBases = pgTable(
  'chat_knowledge_bases',
  {
    organizationId: orgId(organizations),
    chatId: uuid().notNull(),
    /** → knowledge_bases (composite, cascade) once B3-03 lands. */
    knowledgeBaseId: uuid().notNull(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ name: 'chat_knowledge_bases_pkey', columns: [t.chatId, t.knowledgeBaseId] }),
    foreignKey({
      name: 'chat_knowledge_bases_organization_id_chat_id_fkey',
      columns: [t.organizationId, t.chatId],
      foreignColumns: [chats.organizationId, chats.id],
    }).onDelete('cascade'),
    index('chat_knowledge_bases_organization_id_knowledge_base_id_idx').on(
      t.organizationId,
      t.knowledgeBaseId,
    ),
    tenantPolicy('chat_knowledge_bases', t.organizationId),
  ],
)

/** One user or assistant message, with the structured parts the thread renders. */
export const chatMessages = pgTable(
  'chat_messages',
  {
    id: id(),
    organizationId: orgId(organizations),
    chatId: uuid().notNull(),
    role: text().$type<ChatMessageRole>().notNull(),
    status: text().$type<ChatMessageStatus>().notNull(),
    /** Plain text of the `text` parts; used for search, export and Train. */
    contentText: text().notNull().default(''),
    parts: jsonb().$type<ChatMessageParts>().notNull(),
    authorUserId: uuid().references(() => users.id, { onDelete: 'set null' }),
    modelKey: text(),
    vaultModelId: uuid().references(() => vaultModels.id, { onDelete: 'set null' }),
    /** V1: → agent_runs (set null). */
    agentRunId: uuid(),
    /** Compare (V1): both answers to one prompt share it. */
    variantGroupId: uuid(),
    variantLabel: text(),
    inputTokens: bigint({ mode: 'number' }),
    outputTokens: bigint({ mode: 'number' }),
    cachedInputTokens: bigint({ mode: 'number' }),
    reasoningTokens: bigint({ mode: 'number' }),
    /** Display copy of the metered cost; `usage_events` is the record. */
    costMicros: bigint({ mode: 'number' }),
    currency: char({ length: 3 }).notNull().default('USD'),
    latencyMs: integer(),
    timeToFirstTokenMs: integer(),
    dataLocation: text().$type<DataLocation>(),
    piiMasked: boolean().notNull().default(false),
    routed: boolean().notNull().default(false),
    errorCode: text(),
    searchTsv: tsvector().generatedAlwaysAs(sql`to_tsvector('simple', content_text)`),
    ...timestamps(),
  },
  (t) => [
    unique('chat_messages_organization_id_id_key').on(t.organizationId, t.id),
    foreignKey({
      name: 'chat_messages_organization_id_chat_id_fkey',
      columns: [t.organizationId, t.chatId],
      foreignColumns: [chats.organizationId, chats.id],
    }).onDelete('cascade'),
    enumCheck('chat_messages_role_check', t.role, CHAT_MESSAGE_ROLES),
    enumCheck('chat_messages_status_check', t.status, CHAT_MESSAGE_STATUSES),
    enumCheck('chat_messages_data_location_check', t.dataLocation, DATA_LOCATIONS),
    enumCheck('chat_messages_variant_label_check', t.variantLabel, VARIANT_LABELS),
    check(
      'chat_messages_variant_check',
      sql`(${t.variantGroupId} is null) = (${t.variantLabel} is null)`,
    ),
    index('chat_messages_organization_id_chat_id_created_at_idx').on(
      t.organizationId,
      t.chatId,
      t.createdAt,
      t.id,
    ),
    index('chat_messages_organization_id_created_at_idx').on(t.organizationId, t.createdAt),
    index('chat_messages_search_tsv_idx').using('gin', t.searchTsv),
    index('chat_messages_vault_model_id_idx')
      .on(t.vaultModelId)
      .where(sql`${t.vaultModelId} is not null`),
    index('chat_messages_agent_run_id_idx')
      .on(t.agentRunId)
      .where(sql`${t.agentRunId} is not null`),
    index('chat_messages_author_user_id_idx')
      .on(t.authorUserId)
      .where(sql`${t.authorUserId} is not null`),
    index('chat_messages_streaming_idx')
      .on(t.updatedAt)
      .where(sql`${t.status} = 'streaming'`),
    tenantPolicy('chat_messages', t.organizationId),
  ],
)

/** One knowledge passage an answer cited; append-only by convention. */
export const chatMessageCitations = pgTable(
  'chat_message_citations',
  {
    id: id(),
    organizationId: orgId(organizations),
    messageId: uuid().notNull(),
    /** → knowledge_bases (set null) once B3-03 lands. */
    knowledgeBaseId: uuid(),
    /** → knowledge_documents (set null) once B3-03 lands. */
    knowledgeDocumentId: uuid(),
    /** No foreign key: chunks are replaced on re-indexing and re-embedding. */
    chunkId: uuid(),
    page: integer(),
    /** The chip number, 1-based, the same as the `source` part's `index`. */
    rank: smallint().notNull(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique('chat_message_citations_organization_id_id_key').on(t.organizationId, t.id),
    foreignKey({
      name: 'chat_message_citations_organization_id_message_id_fkey',
      columns: [t.organizationId, t.messageId],
      foreignColumns: [chatMessages.organizationId, chatMessages.id],
    }).onDelete('cascade'),
    unique('chat_message_citations_organization_id_message_id_rank_key').on(
      t.organizationId,
      t.messageId,
      t.rank,
    ),
    index('chat_message_citations_organization_id_knowledge_document_id_idx').on(
      t.organizationId,
      t.knowledgeDocumentId,
    ),
    index('chat_message_citations_knowledge_base_id_idx')
      .on(t.knowledgeBaseId)
      .where(sql`${t.knowledgeBaseId} is not null`),
    tenantPolicy('chat_message_citations', t.organizationId),
  ],
)

/** A person's rating of an assistant answer, with an optional correction. */
export const chatMessageFeedback = pgTable(
  'chat_message_feedback',
  {
    id: id(),
    organizationId: orgId(organizations),
    messageId: uuid().notNull(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    rating: text().$type<ChatFeedbackRating>().notNull(),
    /** User content: never written to logs or audit metadata. */
    correctionText: text(),
    isTrainEligible: boolean().notNull(),
    ...timestamps(),
  },
  (t) => [
    unique('chat_message_feedback_organization_id_id_key').on(t.organizationId, t.id),
    foreignKey({
      name: 'chat_message_feedback_organization_id_message_id_fkey',
      columns: [t.organizationId, t.messageId],
      foreignColumns: [chatMessages.organizationId, chatMessages.id],
    }).onDelete('cascade'),
    unique('chat_message_feedback_organization_id_message_id_user_id_key').on(
      t.organizationId,
      t.messageId,
      t.userId,
    ),
    enumCheck('chat_message_feedback_rating_check', t.rating, CHAT_FEEDBACK_RATINGS),
    index('chat_message_feedback_organization_id_created_at_idx')
      .on(t.organizationId, t.createdAt)
      .where(sql`${t.isTrainEligible}`),
    index('chat_message_feedback_user_id_idx').on(t.userId),
    tenantPolicy('chat_message_feedback', t.organizationId),
  ],
)

/** A file or image added to a chat; the bytes live in object storage. */
export const chatAttachments = pgTable(
  'chat_attachments',
  {
    id: id(),
    organizationId: orgId(organizations),
    chatId: uuid().notNull(),
    /** Set when the message is sent. */
    messageId: uuid().references(() => chatMessages.id, { onDelete: 'set null' }),
    uploadedByUserId: uuid().references(() => users.id, { onDelete: 'set null' }),
    /** `orgs/{orgId}/chats/{chatId}/attachments/{attachmentId}`. */
    objectKey: text().notNull(),
    /** Original name; never part of the object key. */
    fileName: text().notNull(),
    /** Verified from the bytes, not trusted from the client. */
    contentType: text().notNull(),
    sizeBytes: bigint({ mode: 'number' }).notNull(),
    /** 32 bytes; set when the upload completes. */
    sha256: bytea(),
    kind: text().$type<ChatAttachmentKind>().notNull(),
    status: text().$type<ChatAttachmentStatus>().notNull().default('uploading'),
    errorCode: text(),
    /** Documents: text from the parse, capped by the contracts limit. */
    extractedText: text(),
    pageCount: integer(),
    ...timestamps(),
  },
  (t) => [
    unique('chat_attachments_organization_id_id_key').on(t.organizationId, t.id),
    foreignKey({
      name: 'chat_attachments_organization_id_chat_id_fkey',
      columns: [t.organizationId, t.chatId],
      foreignColumns: [chats.organizationId, chats.id],
    }).onDelete('cascade'),
    enumCheck('chat_attachments_kind_check', t.kind, CHAT_ATTACHMENT_KINDS),
    enumCheck('chat_attachments_status_check', t.status, CHAT_ATTACHMENT_STATUSES),
    check(
      'chat_attachments_sha256_check',
      sql`${t.sha256} is null or octet_length(${t.sha256}) = 32`,
    ),
    index('chat_attachments_organization_id_chat_id_idx').on(t.organizationId, t.chatId),
    index('chat_attachments_message_id_idx')
      .on(t.messageId)
      .where(sql`${t.messageId} is not null`),
    index('chat_attachments_uploaded_by_user_id_idx')
      .on(t.uploadedByUserId)
      .where(sql`${t.uploadedByUserId} is not null`),
    index('chat_attachments_unlinked_idx')
      .on(t.createdAt)
      .where(sql`${t.messageId} is null`),
    tenantPolicy('chat_attachments', t.organizationId),
  ],
)
