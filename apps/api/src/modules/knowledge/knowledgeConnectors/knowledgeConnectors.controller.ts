// SPDX-License-Identifier: AGPL-3.0-only
import type {
  createKnowledgeConnectorSourceRoute,
  listKnowledgeConnectorItemsRoute,
} from './knowledgeConnectors.schema.js'
import type { KnowledgeConnectorsService } from './knowledgeConnectors.service.js'
import type { ZodReply, ZodRequest } from '@/types/fastify.js'

type ListItems = typeof listKnowledgeConnectorItemsRoute
type Create = typeof createKnowledgeConnectorSourceRoute

/** Connector sources of a knowledge base: the folder picker and adding a source. */
export class KnowledgeConnectorsController {
  constructor(private readonly connectors: KnowledgeConnectorsService) {}

  listItems = async (request: ZodRequest<ListItems>, reply: ZodReply<ListItems>) => {
    reply.ok(await this.connectors.listItems(request.tenant, request.params.baseId, request.query))
  }

  create = async (request: ZodRequest<Create>, reply: ZodReply<Create>) => {
    reply.created(await this.connectors.create(request.tenant, request.params.baseId, request.body))
  }
}
