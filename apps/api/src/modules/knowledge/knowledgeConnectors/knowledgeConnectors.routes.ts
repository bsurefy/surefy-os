// SPDX-License-Identifier: AGPL-3.0-only
import { PERMISSIONS } from '@surefy/contracts'

import {
  createKnowledgeConnectorSourceRoute,
  listKnowledgeConnectorItemsRoute,
} from './knowledgeConnectors.schema.js'

import type { KnowledgeConnectorsController } from './knowledgeConnectors.controller.js'
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'

/** Both need `knowledge:upload` and then Can manage on the base, like the other source writes. */
export function knowledgeConnectorsRoutes(
  controller: KnowledgeConnectorsController,
): FastifyPluginAsyncZod {
  return (app) => {
    const write = app.authorize(PERMISSIONS.KNOWLEDGE_UPLOAD)
    const sources = '/orgs/:orgId/knowledge-bases/:baseId/sources'

    app.get(
      `${sources}/connector-items`,
      { schema: listKnowledgeConnectorItemsRoute, preHandler: write },
      controller.listItems,
    )
    app.post(
      `${sources}/connectors`,
      { schema: createKnowledgeConnectorSourceRoute, preHandler: write },
      controller.create,
    )
    return Promise.resolve()
  }
}
