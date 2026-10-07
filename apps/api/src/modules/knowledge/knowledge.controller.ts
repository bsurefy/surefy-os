// SPDX-License-Identifier: AGPL-3.0-only
import type {
  cancelKnowledgeEmbeddingModelRoute,
  createKnowledgeBaseRoute,
  deleteKnowledgeBaseRoute,
  getKnowledgeAccessRoute,
  getKnowledgeBaseRoute,
  knowledgeAccessImpactRoute,
  knowledgeBaseImpactRoute,
  knowledgeReindexImpactRoute,
  knowledgeSummaryRoute,
  knowledgeTestSearchRoute,
  listDeletedKnowledgeRoute,
  listKnowledgeBasesRoute,
  reindexKnowledgeBaseRoute,
  restoreKnowledgeBaseRoute,
  setKnowledgeAccessRoute,
  setKnowledgeEmbeddingModelRoute,
  updateKnowledgeBaseRoute,
} from './knowledge.schema.js'
import type { KnowledgeService } from './knowledge.service.js'
import type { KnowledgeEmbeddingService } from './knowledgeEmbedding.service.js'
import type { KnowledgeGrantsService } from './knowledgeGrants.service.js'
import type { KnowledgeSearchService } from './knowledgeRetrieval/knowledgeSearch.service.js'
import type { ZodReply, ZodRequest } from '@/types/fastify.js'

type Summary = typeof knowledgeSummaryRoute
type ListDeleted = typeof listDeletedKnowledgeRoute
type List = typeof listKnowledgeBasesRoute
type Create = typeof createKnowledgeBaseRoute
type Get = typeof getKnowledgeBaseRoute
type Update = typeof updateKnowledgeBaseRoute
type Delete = typeof deleteKnowledgeBaseRoute
type Impact = typeof knowledgeBaseImpactRoute
type Restore = typeof restoreKnowledgeBaseRoute
type Reindex = typeof reindexKnowledgeBaseRoute
type ReindexImpact = typeof knowledgeReindexImpactRoute
type SetModel = typeof setKnowledgeEmbeddingModelRoute
type CancelModel = typeof cancelKnowledgeEmbeddingModelRoute
type GetAccess = typeof getKnowledgeAccessRoute
type SetAccess = typeof setKnowledgeAccessRoute
type AccessImpact = typeof knowledgeAccessImpactRoute
type TestSearch = typeof knowledgeTestSearchRoute

/** Knowledge bases, their access, embedding model and test search. Sources: `knowledgeSources`. */
export class KnowledgeController {
  constructor(
    private readonly knowledge: KnowledgeService,
    private readonly embedding: KnowledgeEmbeddingService,
    private readonly grants: KnowledgeGrantsService,
    private readonly search: KnowledgeSearchService,
  ) {}

  summary = async (request: ZodRequest<Summary>, reply: ZodReply<Summary>) => {
    reply.ok(await this.knowledge.summary(request.tenant))
  }

  listDeleted = async (request: ZodRequest<ListDeleted>, reply: ZodReply<ListDeleted>) => {
    const { items, nextCursor } = await this.knowledge.listDeleted(request.tenant, request.query)
    reply.page(items, nextCursor)
  }

  list = async (request: ZodRequest<List>, reply: ZodReply<List>) => {
    const { items, nextCursor } = await this.knowledge.list(request.tenant, request.query)
    reply.page(items, nextCursor)
  }

  create = async (request: ZodRequest<Create>, reply: ZodReply<Create>) => {
    reply.created(await this.knowledge.create(request.tenant, request.body))
  }

  get = async (request: ZodRequest<Get>, reply: ZodReply<Get>) => {
    reply.ok(await this.knowledge.get(request.tenant, request.params.baseId))
  }

  update = async (request: ZodRequest<Update>, reply: ZodReply<Update>) => {
    reply.ok(await this.knowledge.update(request.tenant, request.params.baseId, request.body))
  }

  delete = async (request: ZodRequest<Delete>, reply: ZodReply<Delete>) => {
    await this.knowledge.delete(request.tenant, request.params.baseId)
    reply.noContent()
  }

  impact = async (request: ZodRequest<Impact>, reply: ZodReply<Impact>) => {
    reply.ok(await this.knowledge.impact(request.tenant, request.params.baseId))
  }

  restore = async (request: ZodRequest<Restore>, reply: ZodReply<Restore>) => {
    reply.ok(await this.knowledge.restore(request.tenant, request.params.baseId, request.body))
  }

  reindex = async (request: ZodRequest<Reindex>, reply: ZodReply<Reindex>) => {
    reply.ok(await this.embedding.reindex(request.tenant, request.params.baseId))
  }

  reindexImpact = async (request: ZodRequest<ReindexImpact>, reply: ZodReply<ReindexImpact>) => {
    reply.ok(await this.embedding.impact(request.tenant, request.params.baseId, request.query))
  }

  setEmbeddingModel = async (request: ZodRequest<SetModel>, reply: ZodReply<SetModel>) => {
    const data = await this.embedding.setModel(request.tenant, request.params.baseId, request.body)
    await reply.status(202).send({ data })
  }

  cancelEmbeddingModel = async (request: ZodRequest<CancelModel>, reply: ZodReply<CancelModel>) => {
    await this.embedding.cancel(request.tenant, request.params.baseId)
    reply.noContent()
  }

  access = async (request: ZodRequest<GetAccess>, reply: ZodReply<GetAccess>) => {
    reply.ok(await this.grants.get(request.tenant, request.params.baseId))
  }

  setAccess = async (request: ZodRequest<SetAccess>, reply: ZodReply<SetAccess>) => {
    reply.ok(await this.grants.set(request.tenant, request.params.baseId, request.body))
  }

  accessImpact = async (request: ZodRequest<AccessImpact>, reply: ZodReply<AccessImpact>) => {
    reply.ok(await this.grants.impact(request.tenant, request.params.baseId, request.query.teamId))
  }

  testSearch = async (request: ZodRequest<TestSearch>, reply: ZodReply<TestSearch>) => {
    reply.ok(await this.search.testSearch(request.tenant, request.params.baseId, request.body))
  }
}
