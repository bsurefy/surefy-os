// SPDX-License-Identifier: AGPL-3.0-only
import { z } from 'zod'

import { KNOWLEDGE_RESTORE_WINDOW_DAYS, KNOWLEDGE_SOURCE_TYPES } from './sources.js'
import { userRefDtoSchema } from '../auth/schemas.js'
import { DATA_LOCATIONS } from '../chat/schemas.js'
import { multiValueQuery, searchQuery } from '../core/filters.js'
import { pageQuery, sortQuery } from '../core/pagination.js'
import { modelKeySchema } from '../models/keys.js'
import { teamRefDtoSchema } from '../teams/schemas.js'

// Knowledge bases, their access, the KPIs and Recently deleted (database/knowledge.md §1–2;
// Knowledge › list, base detail › Access and Settings). Everything is scoped to the bases the
// caller may search (`knowledge:read`); creating one needs `knowledge:upload`, and the effective
// level on a base (`manage` for Admins and Owners, else the highest grant) decides the rest. Choosing
// the embedding model also needs `vault:manage`. Routes, under /api/v1/orgs/:orgId:
// GET /knowledge/summary · GET /knowledge/recently-deleted ·
// GET/POST /knowledge-bases · GET/PATCH/DELETE /knowledge-bases/:baseId ·
// GET /knowledge-bases/:baseId/impact · POST …/restore · POST …/reindex · GET …/reindex-impact ·
// PUT/DELETE …/embedding-model · GET/PUT …/access · GET …/access/impact.
// Sources and documents: sources.ts. Test search: search.ts. Retention per base (Enterprise,
// `retention-policies`) has no column yet and joins these DTOs with it.

export const knowledgeBaseNameSchema = z.string().trim().min(1).max(100)
export const knowledgeBaseDescriptionSchema = z.string().trim().max(1000)

export const KNOWLEDGE_CHUNKING_PRESETS = ['default', 'long_documents', 'faqs'] as const
export type KnowledgeChunkingPreset = (typeof KNOWLEDGE_CHUNKING_PRESETS)[number]

export const KNOWLEDGE_ACCESS_LEVELS = ['search', 'manage'] as const
export type KnowledgeAccessLevel = (typeof KNOWLEDGE_ACCESS_LEVELS)[number]

/** How many teams the list's access column and the create dialog's initial access can name. */
export const KNOWLEDGE_ACCESS_TEAMS_MAX = 100

// ── Knowledge bases ─────────────────────────────────────────────────────────────────────────────

const countSchema = z.number().int().nonnegative()

/** The embedding model a base uses, named for the Settings tab and the data-location badge. */
export const knowledgeEmbeddingModelDtoSchema = z.object({
  modelKey: modelKeySchema,
  displayName: z.string(),
  /** "Stays on your server" for local and trained models, "Sent to {provider}" otherwise. */
  dataLocation: z.enum(DATA_LOCATIONS),
})
export type KnowledgeEmbeddingModelDto = z.infer<typeof knowledgeEmbeddingModelDtoSchema>

/** A model change or "Re-index all" that is running; retrieval keeps using the active model meanwhile. */
export const knowledgeReindexProgressDtoSchema = z.object({
  /** The target model; null for a re-index with the same model. */
  target: knowledgeEmbeddingModelDtoSchema.nullable(),
  documentsTotal: countSchema,
  documentsDone: countSchema,
})
export type KnowledgeReindexProgressDto = z.infer<typeof knowledgeReindexProgressDtoSchema>

/** `knowledge_bases` with what the list and the detail header show. */
export const knowledgeBaseDtoSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  description: z.string().nullable(),
  /** "Local models only": searched only when the answering model is local. */
  isLocalOnly: z.boolean(),
  chunkingPreset: z.enum(KNOWLEDGE_CHUNKING_PRESETS),
  /** Null disables uploads: "Choose an embedding model before adding documents". */
  embeddingModel: knowledgeEmbeddingModelDtoSchema.nullable(),
  reindex: knowledgeReindexProgressDtoSchema.nullable(),
  sourceCount: countSchema,
  /** Sources by type, for the list's "sources by type" column. */
  sourcesByType: z.object({ file: countSchema, link: countSchema, connector: countSchema }),
  documentCount: countSchema,
  /** "Searchable passages". */
  chunkCount: countSchema,
  /** The list's processing bar and label: sources ready, in progress, and needing attention. */
  processing: z.object({
    ready: countSchema,
    inProgress: countSchema,
    needsAttention: countSchema,
    /** The average progress of the sources in progress, 0–100. */
    progressPercent: z.number().int().min(0).max(100),
  }),
  /** "Used by N agents" (V1; 0 until agents exist). */
  usedByCount: countSchema,
  /** The teams with a grant, for the list's access column; people exceptions are not listed. */
  accessTeams: z.array(teamRefDtoSchema).max(KNOWLEDGE_ACCESS_TEAMS_MAX),
  /** What the caller can do here: `manage` shows the write actions, `search` the read-only view. */
  effectiveLevel: z.enum(KNOWLEDGE_ACCESS_LEVELS),
  createdBy: userRefDtoSchema.nullable(),
  /** Set while the base waits in Recently deleted. */
  deletedAt: z.iso.datetime().nullable(),
  purgeAt: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(),
  /** The list's "Updated" column. */
  updatedAt: z.iso.datetime(),
})
export type KnowledgeBaseDto = z.infer<typeof knowledgeBaseDtoSchema>

/** The four KPIs above the list. */
export const knowledgeSummaryDtoSchema = z.object({
  knowledgeBases: countSchema,
  sources: countSchema,
  processing: countSchema,
  needsAttention: countSchema,
})
export type KnowledgeSummaryDto = z.infer<typeof knowledgeSummaryDtoSchema>

export const KNOWLEDGE_BASE_LIST_STATES = ['active', 'deleted'] as const
export const KNOWLEDGE_BASE_SORT_FIELDS = ['name', 'updatedAt', 'deletedAt'] as const

/**
 * `GET …/knowledge-bases`: the bases the caller can search, by name by default. `needsAttention`
 * keeps bases with a failed, partly failed or paused source; `state=deleted` is the bases the
 * caller can manage that wait in Recently deleted.
 */
export const listKnowledgeBasesQuerySchema = pageQuery.extend({
  q: searchQuery,
  state: z.enum(KNOWLEDGE_BASE_LIST_STATES).default('active'),
  isLocalOnly: z.stringbool().optional(),
  needsAttention: z.stringbool().optional(),
  sort: sortQuery(KNOWLEDGE_BASE_SORT_FIELDS),
})
export type ListKnowledgeBasesQuery = z.infer<typeof listKnowledgeBasesQuerySchema>

/**
 * `POST …/knowledge-bases` (Builders and above): the base starts on the organization's embedding
 * model, the creator gets Can manage and `teamIds` get Can search, in one transaction. A local-only
 * base needs a local embedding model (`KNOWLEDGE_LOCAL_EMBEDDING_REQUIRED`).
 */
export const createKnowledgeBaseInputSchema = z.object({
  name: knowledgeBaseNameSchema,
  description: knowledgeBaseDescriptionSchema.optional(),
  isLocalOnly: z.boolean().default(false),
  chunkingPreset: z.enum(KNOWLEDGE_CHUNKING_PRESETS).default('default'),
  teamIds: z.array(z.uuid()).max(KNOWLEDGE_ACCESS_TEAMS_MAX).default([]),
})
export type CreateKnowledgeBaseInput = z.infer<typeof createKnowledgeBaseInputSchema>

/**
 * `PATCH …/knowledge-bases/:baseId` (Can manage): rename, describe, switch "Local models only", or
 * pick another chunking preset. A different preset re-indexes the base (T2, see `…/reindex-impact`).
 */
export const updateKnowledgeBaseInputSchema = z.object({
  name: knowledgeBaseNameSchema.optional(),
  description: knowledgeBaseDescriptionSchema.nullable().optional(),
  isLocalOnly: z.boolean().optional(),
  chunkingPreset: z.enum(KNOWLEDGE_CHUNKING_PRESETS).optional(),
})
export type UpdateKnowledgeBaseInput = z.infer<typeof updateKnowledgeBaseInputSchema>

export const KNOWLEDGE_IMPACT_LISTED_MAX = 20

const agentRefSchema = z.object({ id: z.uuid(), name: z.string() })

/** `GET …/knowledge-bases/:baseId/impact`: what the T3 delete dialog names ("2 agents use it"). */
export const knowledgeBaseImpactDtoSchema = z.object({
  sourceCount: countSchema,
  chunkCount: countSchema,
  /** Agents that use the base (V1); the first `KNOWLEDGE_IMPACT_LISTED_MAX` are named. */
  agentCount: countSchema,
  agents: z.array(agentRefSchema).max(KNOWLEDGE_IMPACT_LISTED_MAX),
  /** Chats that selected this base in their knowledge scope. */
  chatCount: countSchema,
  restoreWindowDays: z.literal(KNOWLEDGE_RESTORE_WINDOW_DAYS),
})
export type KnowledgeBaseImpactDto = z.infer<typeof knowledgeBaseImpactDtoSchema>

/** `POST …/knowledge-bases/:baseId/restore`: a name only when the old one was taken meanwhile. */
export const restoreKnowledgeBaseInputSchema = z.object({
  name: knowledgeBaseNameSchema.optional(),
})
export type RestoreKnowledgeBaseInput = z.infer<typeof restoreKnowledgeBaseInputSchema>

// ── Embedding model and re-indexing ─────────────────────────────────────────────────────────────

/** `GET …/reindex-impact?modelKey=`: "1,240 passages will be re-indexed, about 20 minutes". */
export const knowledgeReindexImpactQuerySchema = z.object({ modelKey: modelKeySchema.optional() })
export type KnowledgeReindexImpactQuery = z.infer<typeof knowledgeReindexImpactQuerySchema>

export const knowledgeReindexImpactDtoSchema = z.object({
  documentCount: countSchema,
  chunkCount: countSchema,
  estimatedMinutes: countSchema,
})
export type KnowledgeReindexImpactDto = z.infer<typeof knowledgeReindexImpactDtoSchema>

/**
 * `PUT …/embedding-model` (Admin and above): starts re-embedding with this model (202; the base
 * stays searchable and swaps at the end). `DELETE` cancels a running change before the swap.
 */
export const setKnowledgeEmbeddingModelInputSchema = z.object({ modelKey: modelKeySchema })
export type SetKnowledgeEmbeddingModelInput = z.infer<typeof setKnowledgeEmbeddingModelInputSchema>

// ── Access ──────────────────────────────────────────────────────────────────────────────────────

export const KNOWLEDGE_ACCESS_SUBJECT_TYPES = ['team', 'user'] as const
export type KnowledgeAccessSubjectType = (typeof KNOWLEDGE_ACCESS_SUBJECT_TYPES)[number]

export const KNOWLEDGE_ACCESS_GRANTS_MAX = 200

/**
 * `knowledge_base_access`: a grant of Can search or Can manage. Rows only grant; "No access" is no
 * row. People rows are exceptions. A team's `manage` applies only to its Builders and above (Users
 * in the team get Can search). Agent subjects arrive with V1.
 */
export const knowledgeAccessGrantDtoSchema = z.object({
  id: z.uuid(),
  subjectType: z.enum(KNOWLEDGE_ACCESS_SUBJECT_TYPES),
  team: teamRefDtoSchema.nullable(),
  user: userRefDtoSchema.nullable(),
  level: z.enum(KNOWLEDGE_ACCESS_LEVELS),
  createdAt: z.iso.datetime(),
})
export type KnowledgeAccessGrantDto = z.infer<typeof knowledgeAccessGrantDtoSchema>

export const knowledgeAccessGrantInputSchema = z.discriminatedUnion('subjectType', [
  z.object({
    subjectType: z.literal('team'),
    teamId: z.uuid(),
    level: z.enum(KNOWLEDGE_ACCESS_LEVELS),
  }),
  z.object({
    subjectType: z.literal('user'),
    userId: z.uuid(),
    level: z.enum(KNOWLEDGE_ACCESS_LEVELS),
  }),
])
export type KnowledgeAccessGrantInput = z.infer<typeof knowledgeAccessGrantInputSchema>

/** `PUT …/access` (Can manage): replaces the grants; an empty list leaves only Admins and Owners. */
export const setKnowledgeAccessInputSchema = z.object({
  grants: z.array(knowledgeAccessGrantInputSchema).max(KNOWLEDGE_ACCESS_GRANTS_MAX),
})
export type SetKnowledgeAccessInput = z.infer<typeof setKnowledgeAccessInputSchema>

/** The Access tab: the grants, and "Local models only" with the agents it blocks. */
export const knowledgeAccessDtoSchema = z.object({
  grants: z.array(knowledgeAccessGrantDtoSchema),
  isLocalOnly: z.boolean(),
  /** Agents (V1) that use a cloud model and so skip this base. */
  blockedAgents: z.array(agentRefSchema).max(KNOWLEDGE_IMPACT_LISTED_MAX),
})
export type KnowledgeAccessDto = z.infer<typeof knowledgeAccessDtoSchema>

/** `GET …/access/impact?teamId=`: what the T2 "Remove access" dialog names. */
export const knowledgeAccessImpactQuerySchema = z.object({ teamId: z.uuid() })
export type KnowledgeAccessImpactQuery = z.infer<typeof knowledgeAccessImpactQuerySchema>

export const knowledgeAccessImpactDtoSchema = z.object({
  team: teamRefDtoSchema,
  memberCount: countSchema,
  agentCount: countSchema,
  agents: z.array(agentRefSchema).max(KNOWLEDGE_IMPACT_LISTED_MAX),
})
export type KnowledgeAccessImpactDto = z.infer<typeof knowledgeAccessImpactDtoSchema>

// ── Recently deleted ────────────────────────────────────────────────────────────────────────────

export const DELETED_KNOWLEDGE_KINDS = ['knowledge_base', 'source'] as const
export type DeletedKnowledgeKind = (typeof DELETED_KNOWLEDGE_KINDS)[number]

const deletedItemShape = {
  id: z.uuid(),
  name: z.string(),
  deletedAt: z.iso.datetime(),
  /** "Restorable for 12 more days" counts down to this. */
  purgeAt: z.iso.datetime(),
  deletedBy: userRefDtoSchema.nullable(),
} as const

/**
 * A base or a source in Recently deleted. A source can be restored only while its base is active
 * (`canRestore`); a restored source is searchable at once because its passages were kept.
 */
export const deletedKnowledgeItemDtoSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('knowledge_base'),
    ...deletedItemShape,
    sourceCount: countSchema,
    canRestore: z.boolean(),
  }),
  z.object({
    kind: z.literal('source'),
    ...deletedItemShape,
    sourceType: z.enum(KNOWLEDGE_SOURCE_TYPES),
    knowledgeBase: z.object({ id: z.uuid(), name: z.string() }),
    canRestore: z.boolean(),
  }),
])
export type DeletedKnowledgeItemDto = z.infer<typeof deletedKnowledgeItemDtoSchema>

export const DELETED_KNOWLEDGE_SORT_FIELDS = ['deletedAt'] as const

/** `GET …/knowledge/recently-deleted`: for people who can manage at least one base; most recent first. */
export const listDeletedKnowledgeQuerySchema = pageQuery.extend({
  q: searchQuery,
  kind: multiValueQuery(z.enum(DELETED_KNOWLEDGE_KINDS)),
  sort: sortQuery(DELETED_KNOWLEDGE_SORT_FIELDS),
})
export type ListDeletedKnowledgeQuery = z.infer<typeof listDeletedKnowledgeQuerySchema>
