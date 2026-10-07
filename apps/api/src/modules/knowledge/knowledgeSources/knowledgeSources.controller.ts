// SPDX-License-Identifier: AGPL-3.0-only
import type {
  bulkKnowledgeSourcesRoute,
  completeKnowledgeSourceRoute,
  createKnowledgeLinkRoute,
  deleteKnowledgeSourceRoute,
  downloadKnowledgeDocumentRoute,
  getKnowledgeDocumentRoute,
  getKnowledgeSourceRoute,
  listKnowledgeDocumentPagesRoute,
  listKnowledgeDocumentsRoute,
  listKnowledgeSourcesRoute,
  requestKnowledgeFileUploadRoute,
  restoreKnowledgeSourceRoute,
  retryKnowledgeSourceRoute,
  syncKnowledgeSourceRoute,
  updateKnowledgeSourceRoute,
} from './knowledgeSources.schema.js'
import type { KnowledgeSourcesService } from './knowledgeSources.service.js'
import type { ZodReply, ZodRequest } from '@/types/fastify.js'

type List = typeof listKnowledgeSourcesRoute
type RequestUpload = typeof requestKnowledgeFileUploadRoute
type CreateLink = typeof createKnowledgeLinkRoute
type Bulk = typeof bulkKnowledgeSourcesRoute
type Get = typeof getKnowledgeSourceRoute
type Update = typeof updateKnowledgeSourceRoute
type Delete = typeof deleteKnowledgeSourceRoute
type Complete = typeof completeKnowledgeSourceRoute
type Retry = typeof retryKnowledgeSourceRoute
type Sync = typeof syncKnowledgeSourceRoute
type Restore = typeof restoreKnowledgeSourceRoute
type ListDocuments = typeof listKnowledgeDocumentsRoute
type GetDocument = typeof getKnowledgeDocumentRoute
type DocumentPages = typeof listKnowledgeDocumentPagesRoute
type Download = typeof downloadKnowledgeDocumentRoute

/** Sources and documents of a knowledge base. */
export class KnowledgeSourcesController {
  constructor(private readonly sources: KnowledgeSourcesService) {}

  list = async (request: ZodRequest<List>, reply: ZodReply<List>) => {
    const { items, nextCursor } = await this.sources.list(
      request.tenant,
      request.params.baseId,
      request.query,
    )
    reply.page(items, nextCursor)
  }

  requestUpload = async (request: ZodRequest<RequestUpload>, reply: ZodReply<RequestUpload>) => {
    reply.created(
      await this.sources.requestFileUpload(request.tenant, request.params.baseId, request.body),
    )
  }

  createLink = async (request: ZodRequest<CreateLink>, reply: ZodReply<CreateLink>) => {
    reply.created(
      await this.sources.createLink(request.tenant, request.params.baseId, request.body),
    )
  }

  bulk = async (request: ZodRequest<Bulk>, reply: ZodReply<Bulk>) => {
    reply.ok(await this.sources.bulk(request.tenant, request.params.baseId, request.body))
  }

  get = async (request: ZodRequest<Get>, reply: ZodReply<Get>) => {
    reply.ok(await this.sources.get(request.tenant, request.params.baseId, request.params.sourceId))
  }

  update = async (request: ZodRequest<Update>, reply: ZodReply<Update>) => {
    reply.ok(
      await this.sources.update(
        request.tenant,
        request.params.baseId,
        request.params.sourceId,
        request.body,
      ),
    )
  }

  delete = async (request: ZodRequest<Delete>, reply: ZodReply<Delete>) => {
    await this.sources.delete(request.tenant, request.params.baseId, request.params.sourceId)
    reply.noContent()
  }

  complete = async (request: ZodRequest<Complete>, reply: ZodReply<Complete>) => {
    reply.ok(
      await this.sources.complete(request.tenant, request.params.baseId, request.params.sourceId),
    )
  }

  retry = async (request: ZodRequest<Retry>, reply: ZodReply<Retry>) => {
    reply.ok(
      await this.sources.retry(
        request.tenant,
        request.params.baseId,
        request.params.sourceId,
        request.body,
      ),
    )
  }

  sync = async (request: ZodRequest<Sync>, reply: ZodReply<Sync>) => {
    reply.ok(
      await this.sources.sync(request.tenant, request.params.baseId, request.params.sourceId),
    )
  }

  restore = async (request: ZodRequest<Restore>, reply: ZodReply<Restore>) => {
    reply.ok(
      await this.sources.restore(request.tenant, request.params.baseId, request.params.sourceId),
    )
  }

  listDocuments = async (request: ZodRequest<ListDocuments>, reply: ZodReply<ListDocuments>) => {
    const { items, nextCursor } = await this.sources.listDocuments(
      request.tenant,
      request.params.baseId,
      request.params.sourceId,
      request.query,
    )
    reply.page(items, nextCursor)
  }

  document = async (request: ZodRequest<GetDocument>, reply: ZodReply<GetDocument>) => {
    reply.ok(
      await this.sources.getDocument(
        request.tenant,
        request.params.baseId,
        request.params.documentId,
      ),
    )
  }

  documentPages = async (request: ZodRequest<DocumentPages>, reply: ZodReply<DocumentPages>) => {
    const { items, nextCursor } = await this.sources.documentPages(
      request.tenant,
      request.params.baseId,
      request.params.documentId,
      request.query,
    )
    reply.page(items, nextCursor)
  }

  download = async (request: ZodRequest<Download>, reply: ZodReply<Download>) => {
    reply.ok(
      await this.sources.download(request.tenant, request.params.baseId, request.params.documentId),
    )
  }
}
