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
  CHAT_SHARE_SUBJECT_TYPES,
  DATA_LOCATIONS,
  PROMPT_VISIBILITIES,
} from '@surefy/contracts'
import type {
  ChatAttachmentKind,
  ChatAttachmentStatus,
  ChatFeedbackRating,
  ChatKnowledgeScope,
  ChatMessageParts,
  ChatMessageRole,
  ChatMessageStatus,
  ChatShareSubjectType,
  ChatVariantLabel,
  DataLocation,
  PromptVisibility,
} from '@surefy/contracts'

import { agents } from './agents.tables.js'
import { users } from './auth.tables.js'
import { organizationMembers, organizations } from './organizations.tables.js'
import { teams } from './teams.tables.js'
import { vaultModels } from './vault.tables.js'
import { enumCheck } from '../checks.js'
import { createdBy, id, orgId, softDelete, timestamps } from '../columns.js'
import { bytea, tsvector } from '../columnTypes.js'
import { tenantPolicy } from '../policies.js'

// Chat (database/chat.md): folders, chats and their knowledge scope, messages with their
// structured parts, citations, answer feedback and attachments (§1–7), shares and the prompt
// library (§8–10). `chat_knowledge_bases` and `chat_message_citations` hold the knowledge ids
// without foreign keys. `chat_messages.agent_run_id` → `agent_runs` is declared in the
// `chat-v1-security` migration: `agent_runs` already references `chats`, and the table files do
// not import each other in a cycle.

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
    /** A shared agent the chat talks to (V1). */
    agentId: uuid().references(() => agents.id, { onDelete: 'set null' }),
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
    /** Answers from an agent (V1): → agent_runs (set null), declared in the migration. */
    agentRunId: uuid(),
    /** Compare (V1): both answers to one prompt share it. */
    variantGroupId: uuid(),
    variantLabel: text().$type<ChatVariantLabel>(),
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

/** A view-only share of one chat with a person or a team of the same organization. */
export const chatShares = pgTable(
  'chat_shares',
  {
    id: id(),
    organizationId: orgId(organizations),
    chatId: uuid().notNull(),
    subjectType: text().$type<ChatShareSubjectType>().notNull(),
    /** ⇉ (organization_id, user_id) → organization_members (cascade). */
    userId: uuid(),
    /** ⇉ (organization_id, team_id) → teams (cascade). */
    teamId: uuid(),
    sharedByUserId: uuid().references(() => users.id, { onDelete: 'set null' }),
    ...timestamps(),
  },
  (t) => [
    unique('chat_shares_organization_id_id_key').on(t.organizationId, t.id),
    unique('chat_shares_subject_key')
      .on(t.organizationId, t.chatId, t.subjectType, t.userId, t.teamId)
      .nullsNotDistinct(),
    foreignKey({
      name: 'chat_shares_organization_id_chat_id_fkey',
      columns: [t.organizationId, t.chatId],
      foreignColumns: [chats.organizationId, chats.id],
    }).onDelete('cascade'),
    foreignKey({
      name: 'chat_shares_organization_id_user_id_fkey',
      columns: [t.organizationId, t.userId],
      foreignColumns: [organizationMembers.organizationId, organizationMembers.userId],
    }).onDelete('cascade'), // removing a member removes the shares with them
    foreignKey({
      name: 'chat_shares_organization_id_team_id_fkey',
      columns: [t.organizationId, t.teamId],
      foreignColumns: [teams.organizationId, teams.id],
    }).onDelete('cascade'),
    enumCheck('chat_shares_subject_type_check', t.subjectType, CHAT_SHARE_SUBJECT_TYPES),
    check(
      'chat_shares_subject_check',
      sql`(${t.subjectType} = 'user' and ${t.userId} is not null and ${t.teamId} is null) or (${t.subjectType} = 'team' and ${t.teamId} is not null and ${t.userId} is null)`,
    ),
    index('chat_shares_organization_id_user_id_idx')
      .on(t.organizationId, t.userId)
      .where(sql`${t.userId} is not null`),
    index('chat_shares_organization_id_team_id_idx')
      .on(t.organizationId, t.teamId)
      .where(sql`${t.teamId} is not null`),
    index('chat_shares_shared_by_user_id_idx')
      .on(t.sharedByUserId)
      .where(sql`${t.sharedByUserId} is not null`),
    tenantPolicy('chat_shares', t.organizationId),
  ],
)

/** A reusable prompt with `{variables}`, personal or shared; soft delete, restorable for 30 days. */
export const prompts = pgTable(
  'prompts',
  {
    id: id(),
    organizationId: orgId(organizations),
    /** Required for personal prompts; null for a shared prompt whose owner was erased. */
    ownerUserId: uuid().references(() => users.id, { onDelete: 'set null' }),
    title: text().notNull(),
    body: text().notNull(),
    /** Names parsed from the `{name}` placeholders of the body on save, in order of first use. */
    variables: text()
      .array()
      .notNull()
      .default(sql`'{}'`),
    visibility: text().$type<PromptVisibility>().notNull().default('personal'),
    ...createdBy(users),
    updatedByUserId: uuid().references(() => users.id, { onDelete: 'set null' }),
    ...softDelete(users),
    ...timestamps(),
  },
  (t) => [
    unique('prompts_organization_id_id_key').on(t.organizationId, t.id),
    enumCheck('prompts_visibility_check', t.visibility, PROMPT_VISIBILITIES),
    check(
      'prompts_personal_owner_check',
      sql`${t.visibility} <> 'personal' or ${t.ownerUserId} is not null`,
    ),
    check('prompts_deleted_check', sql`${t.deletedByUserId} is null or ${t.deletedAt} is not null`),
    index('prompts_organization_id_owner_user_id_idx')
      .on(t.organizationId, t.ownerUserId, t.updatedAt.desc())
      .where(sql`${t.deletedAt} is null`),
    index('prompts_organization_id_shared_idx')
      .on(t.organizationId, t.updatedAt.desc())
      .where(sql`${t.visibility} = 'shared' and ${t.deletedAt} is null`),
    index('prompts_organization_id_deleted_at_idx')
      .on(t.organizationId, t.deletedAt.desc())
      .where(sql`${t.deletedAt} is not null`),
    index('prompts_deleted_at_idx')
      .on(t.deletedAt)
      .where(sql`${t.deletedAt} is not null`),
    tenantPolicy('prompts', t.organizationId),
  ],
)

/** Limits a shared prompt to teams; a shared prompt without rows is seen by the organization. */
export const promptShares = pgTable(
  'prompt_shares',
  {
    organizationId: orgId(organizations),
    promptId: uuid().notNull(),
    teamId: uuid().notNull(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ name: 'prompt_shares_pkey', columns: [t.promptId, t.teamId] }),
    foreignKey({
      name: 'prompt_shares_organization_id_prompt_id_fkey',
      columns: [t.organizationId, t.promptId],
      foreignColumns: [prompts.organizationId, prompts.id],
    }).onDelete('cascade'),
    foreignKey({
      name: 'prompt_shares_organization_id_team_id_fkey',
      columns: [t.organizationId, t.teamId],
      foreignColumns: [teams.organizationId, teams.id],
    }).onDelete('cascade'),
    index('prompt_shares_organization_id_team_id_idx').on(t.organizationId, t.teamId),
    tenantPolicy('prompt_shares', t.organizationId),
  ],
)
