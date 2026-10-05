// SPDX-License-Identifier: AGPL-3.0-only
import { rerank, selectPassages } from './knowledgeRerank.js'
import { DEFAULT_PASSAGES } from './knowledgeRetrieval.constants.js'

import type { KnowledgeRepository } from '../knowledge.repository.js'
import type { KnowledgeGateway, KnowledgeModels, KnowledgeSearcher } from '../knowledge.types.js'
import type { KnowledgeAccessService } from '../knowledgeAccess.service.js'
import type { FoundChunk, KnowledgeRetrievalRepository } from './knowledgeRetrieval.repository.js'
import type { Database } from '@/core/database/index.js'
import type { ModelCallContext } from '@/modules/modelGateway/index.js'

export interface RetrievalRequest {
  orgId: string
  /** Whose reading rights bound the search: the asker; for an agent run, the asking person. */
  who: KnowledgeSearcher
  question: string
  /** Narrow the search to these bases (a chat's knowledge scope); never widens the asker's access. */
  baseIds?: readonly string[]
  /** "Local models only" bases are searched only when the answering model is local. */
  answeringModelIsLocal: boolean
  /** Passages kept for the answer; 5 by default. */
  passages?: number
  /** 0–1: passages scoring lower are not used. */
  minRelevance?: number
  /** Fit the used passages into this many tokens of the model's context. */
  contextTokens?: number
  /** The model call context the question embeddings are made and metered under. */
  call: ModelCallContext
  signal?: AbortSignal
}

export interface RetrievedPassage extends FoundChunk {
  /** 0–1, after reranking. */
  relevance: number
  /** True for the passages that reach the answer. */
  isUsed: boolean
}

export interface RetrievalResult {
  /** Every passage found, most relevant first. */
  passages: RetrievedPassage[]
  /** Bases left out because they are limited to local models and the answering model is not. */
  skippedLocalOnly: { id: string; name: string }[]
  /** Sources still processing in the searched bases: they were not searched. */
  notSearchedSourceCount: number
}

export interface KnowledgeRetrievalDeps {
  db: Database
  repository: KnowledgeRepository
  retrieval: KnowledgeRetrievalRepository
  access: KnowledgeAccessService
  models: KnowledgeModels
  gateway: KnowledgeGateway
}

/**
 * Retrieval for chat, agents and Test search (database/knowledge.md, Retrieval): resolve which
 * bases the asker may search, embed the question once per embedding model, search each model's
 * chunks, then rerank and pick what fits. Filtering happens before ranking, so content a person
 * may not read never reaches the model.
 */
export class KnowledgeRetrievalService {
  constructor(private readonly deps: KnowledgeRetrievalDeps) {}

  async retrieve(request: RetrievalRequest): Promise<RetrievalResult> {
    const { orgId } = request
    const plan = await this.deps.db.tenant(orgId, async (tx) => {
      const baseIds = await this.deps.access.searchableBaseIds(
        tx,
        orgId,
        request.who,
        request.baseIds,
      )
      const bases = await this.deps.repository.findBases(tx, orgId, baseIds)
      const skippedLocalOnly = bases
        .filter((base) => base.isLocalOnly && !request.answeringModelIsLocal)
        .map((base) => ({ id: base.id, name: base.name }))
      const skipped = new Set(skippedLocalOnly.map((base) => base.id))
      const searchable = bases.filter((base) => !skipped.has(base.id))
      const byModel = new Map<string, string[]>()
      for (const base of searchable) {
        if (base.embeddingModelKey === null) continue
        byModel.set(base.embeddingModelKey, [
          ...(byModel.get(base.embeddingModelKey) ?? []),
          base.id,
        ])
      }
      const models = await this.deps.models.findByKeysInTx(tx, orgId, [...byModel.keys()])
      return {
        skippedLocalOnly,
        byModel: [...byModel].flatMap(([modelKey, ids]) => {
          const dimensions = models.find(
            (model) => model.modelKey === modelKey,
          )?.embeddingDimensions
          return dimensions === null || dimensions === undefined
            ? []
            : [{ modelKey, dimensions, baseIds: ids }]
        }),
        notSearchedSourceCount: await this.deps.retrieval.openSourceCount(
          tx,
          orgId,
          searchable.map((base) => base.id),
        ),
      }
    })
    if (plan.byModel.length === 0) {
      return {
        passages: [],
        skippedLocalOnly: plan.skippedLocalOnly,
        notSearchedSourceCount: plan.notSearchedSourceCount,
      }
    }
    const embedded = await Promise.all(
      plan.byModel.map(async (entry) => ({
        ...entry,
        embedding: (
          await this.deps.gateway.embedMany(request.call, {
            modelKey: entry.modelKey,
            values: [request.question],
            ...(request.signal === undefined ? {} : { signal: request.signal }),
          })
        ).embeddings[0],
      })),
    )
    const found = await this.deps.db.tenant(orgId, async (tx) => {
      const chunks: FoundChunk[] = []
      for (const entry of embedded) {
        if (entry.embedding === undefined) continue
        chunks.push(
          ...(await this.deps.retrieval.search(tx, {
            orgId,
            baseIds: entry.baseIds,
            modelKey: entry.modelKey,
            dimensions: entry.dimensions,
            embedding: entry.embedding,
            question: request.question,
          })),
        )
      }
      return chunks.sort((a, b) => b.rrfScore - a.rrfScore)
    })
    const ranked = rerank(
      found.map((chunk) => ({ ...chunk, chunkId: chunk.chunkId })),
      request.question,
    )
    const used = new Set(
      selectPassages(ranked, {
        minRelevance: request.minRelevance ?? 0,
        limit: request.passages ?? DEFAULT_PASSAGES,
        ...(request.contextTokens === undefined ? {} : { contextTokens: request.contextTokens }),
      }).map((item) => item.candidate.chunkId),
    )
    return {
      passages: ranked.map(({ candidate, relevance }) => ({
        ...candidate,
        relevance,
        isUsed: used.has(candidate.chunkId),
      })),
      skippedLocalOnly: plan.skippedLocalOnly,
      notSearchedSourceCount: plan.notSearchedSourceCount,
    }
  }
}
