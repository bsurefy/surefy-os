// SPDX-License-Identifier: AGPL-3.0-only

import { callContextOf } from './knowledgeSearch.service.js'

import type { KnowledgeRepository } from '../knowledge.repository.js'
import type { KnowledgeSearcher } from '../knowledge.types.js'
import type { KnowledgeAccessService } from '../knowledgeAccess.service.js'
import type { KnowledgeRetrievalRepository } from './knowledgeRetrieval.repository.js'
import type { KnowledgeRetrievalService } from './knowledgeRetrieval.service.js'
import type { Database } from '@/core/database/index.js'
import type {
  ChatRetrieval,
  ChatRetrievalRequest,
  ChatRetrievalResult,
  ChatSourceCheck,
  ChatSourceLookup,
} from '@/modules/chats/index.js'

export interface KnowledgeChatRetrievalDeps {
  db: Database
  repository: KnowledgeRepository
  retrieval: KnowledgeRetrievalService
  passages: KnowledgeRetrievalRepository
  access: KnowledgeAccessService
}

const searcherOf = (ctx: ChatRetrievalRequest['ctx']): KnowledgeSearcher => ({
  userId: ctx.userId,
  role: ctx.role,
  teamIds: ctx.teamIds,
})

/**
 * What chats use to answer with sources: the person's own search of the knowledge bases in the
 * chat's scope, and the check of a cited passage when its preview opens. The same retrieval as
 * Test search, so what a manager tries there is what the chat finds.
 */
export class KnowledgeChatRetrieval implements ChatRetrieval {
  constructor(private readonly deps: KnowledgeChatRetrievalDeps) {}

  async retrieve(request: ChatRetrievalRequest): Promise<ChatRetrievalResult> {
    const { ctx } = request
    const result = await this.deps.retrieval.retrieve({
      orgId: ctx.orgId,
      who: searcherOf(ctx),
      question: request.query,
      ...(request.scope === 'selected' ? { baseIds: request.knowledgeBaseIds } : {}),
      answeringModelIsLocal: request.answeringModelIsLocal,
      call: callContextOf(ctx, `chat_retrieval:${ctx.requestId}`),
      ...(request.signal === undefined ? {} : { signal: request.signal }),
    })
    const passages = result.passages
      .filter((passage) => passage.isUsed)
      .map((passage) => ({
        knowledgeBaseId: passage.knowledgeBaseId,
        documentId: passage.documentId,
        chunkId: passage.chunkId,
        page: passage.pageFrom,
        title: passage.documentTitle,
        text: passage.content,
      }))
    return {
      passages,
      // sources that exist but are not read yet, and nothing else to answer from
      skipped:
        passages.length === 0 && result.notSearchedSourceCount > 0 ? 'no_ready_sources' : null,
      processingCount: result.notSearchedSourceCount,
    }
  }

  async checkSource({ ctx, source }: ChatSourceLookup): Promise<ChatSourceCheck> {
    if (source.kind !== 'knowledge' || source.knowledgeBaseId === undefined) {
      return { status: 'removed', passage: null, canOpenInKnowledge: false }
    }
    const { knowledgeBaseId, chunkId } = source
    return this.deps.db.tenant(ctx.orgId, async (tx) => {
      const base = await this.deps.repository.findBase(tx, ctx.orgId, knowledgeBaseId)
      // a base that does not exist reads as deleted: `undefined !== null`
      if (base?.deletedAt !== null) {
        return { status: 'removed', passage: null, canOpenInKnowledge: false }
      }
      const level = (
        await this.deps.access.levelsFor(tx, ctx.orgId, searcherOf(ctx), [knowledgeBaseId])
      ).get(knowledgeBaseId)
      if (level === undefined)
        return { status: 'no_access', passage: null, canOpenInKnowledge: false }
      const passage =
        chunkId === undefined
          ? undefined
          : await this.deps.passages.findPassage(tx, ctx.orgId, chunkId)
      if (passage === undefined)
        return { status: 'removed', passage: null, canOpenInKnowledge: false }
      return {
        status: 'available',
        passage: passage.content,
        canOpenInKnowledge: level === 'manage',
      }
    })
  }
}
