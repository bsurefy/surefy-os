// SPDX-License-Identifier: AGPL-3.0-only
import { z } from 'zod'

import { modelKeySchema } from '../models/keys.js'

// Test search (database/knowledge.md › Retrieval; Knowledge › base detail › Test search). Route:
// POST /api/v1/orgs/:orgId/knowledge-bases/:baseId/test-search (Can manage). It runs the same
// retrieval chat uses, as the person or as one of their teams, so an admin can check what a team
// would find and which passages reach the answer. The question is user content: never logged.

export const KNOWLEDGE_SEARCH_LIMITS = {
  questionMaxLength: 2000,
  /** Passages kept for the answer. */
  passagesDefault: 5,
  passagesMax: 20,
  /** Relevance below this is dropped; 0 keeps everything the search returns. */
  minRelevanceDefault: 0,
} as const

/** Whose access the search runs with; an agent (V1) joins as a third choice. */
export const knowledgeSearchAsSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('me') }),
  z.object({ type: z.literal('team'), teamId: z.uuid() }),
])
export type KnowledgeSearchAs = z.infer<typeof knowledgeSearchAsSchema>

export const knowledgeTestSearchInputSchema = z.object({
  question: z.string().trim().min(1).max(KNOWLEDGE_SEARCH_LIMITS.questionMaxLength),
  /** 0–1: passages scoring lower are not used. */
  minRelevance: z.number().min(0).max(1).default(KNOWLEDGE_SEARCH_LIMITS.minRelevanceDefault),
  passagesPerAnswer: z
    .number()
    .int()
    .min(1)
    .max(KNOWLEDGE_SEARCH_LIMITS.passagesMax)
    .default(KNOWLEDGE_SEARCH_LIMITS.passagesDefault),
  searchAs: knowledgeSearchAsSchema.default({ type: 'me' }),
  /** Ask a model to write the answer from the used passages; the call is metered like any other. */
  includeAnswer: z.boolean().default(true),
})
export type KnowledgeTestSearchInput = z.infer<typeof knowledgeTestSearchInputSchema>

/** A passage found, with how relevant it is and whether it made it into the answer. */
export const knowledgeTestPassageDtoSchema = z.object({
  chunkId: z.uuid(),
  documentId: z.uuid(),
  sourceId: z.uuid(),
  documentTitle: z.string(),
  sourceName: z.string(),
  pageFrom: z.number().int().min(1).nullable(),
  pageTo: z.number().int().min(1).nullable(),
  headingPath: z.array(z.string()),
  content: z.string(),
  /** 0–1, after reranking. */
  relevance: z.number().min(0).max(1),
  /** True for the passages at or above `minRelevance`, up to `passagesPerAnswer`. */
  isUsed: z.boolean(),
})
export type KnowledgeTestPassageDto = z.infer<typeof knowledgeTestPassageDtoSchema>

export const knowledgeTestSearchDtoSchema = z.object({
  /** Null without `includeAnswer`, when no passage was used, or when no model could answer. */
  answerPreview: z.object({ text: z.string(), modelKey: modelKeySchema }).nullable(),
  /** Every passage found, most relevant first. */
  passages: z.array(knowledgeTestPassageDtoSchema).max(KNOWLEDGE_SEARCH_LIMITS.passagesMax * 3),
  /** Sources still processing, which were not searched. */
  notSearchedSourceCount: z.number().int().nonnegative(),
})
export type KnowledgeTestSearchDto = z.infer<typeof knowledgeTestSearchDtoSchema>
