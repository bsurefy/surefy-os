// SPDX-License-Identifier: AGPL-3.0-only
import { PERMISSIONS } from '@surefy/contracts'

import {
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

import type { KnowledgeController } from './knowledge.controller.js'
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'

/**
 * Reads need `knowledge:read`; writes need `knowledge:upload` (Builders and above) and then Can
 * manage on the base, which the services check. Choosing the embedding model is an Admin action.
 */
export function knowledgeRoutes(controller: KnowledgeController): FastifyPluginAsyncZod {
  return (app) => {
    const read = app.authorize(PERMISSIONS.KNOWLEDGE_READ)
    const write = app.authorize(PERMISSIONS.KNOWLEDGE_UPLOAD)
    const admin = app.authorize(PERMISSIONS.VAULT_MANAGE)
    const bases = '/orgs/:orgId/knowledge-bases'
    const base = `${bases}/:baseId`

    app.get(
      '/orgs/:orgId/knowledge/summary',
      { schema: knowledgeSummaryRoute, preHandler: read },
      controller.summary,
    )
    app.get(
      '/orgs/:orgId/knowledge/recently-deleted',
      { schema: listDeletedKnowledgeRoute, preHandler: read },
      controller.listDeleted,
    )
    app.get(bases, { schema: listKnowledgeBasesRoute, preHandler: read }, controller.list)
    app.post(bases, { schema: createKnowledgeBaseRoute, preHandler: write }, controller.create)
    app.get(base, { schema: getKnowledgeBaseRoute, preHandler: read }, controller.get)
    app.patch(base, { schema: updateKnowledgeBaseRoute, preHandler: write }, controller.update)
    app.delete(base, { schema: deleteKnowledgeBaseRoute, preHandler: write }, controller.delete)
    app.get(
      `${base}/impact`,
      { schema: knowledgeBaseImpactRoute, preHandler: write },
      controller.impact,
    )
    app.post(
      `${base}/restore`,
      { schema: restoreKnowledgeBaseRoute, preHandler: write },
      controller.restore,
    )
    app.post(
      `${base}/reindex`,
      { schema: reindexKnowledgeBaseRoute, preHandler: write },
      controller.reindex,
    )
    app.get(
      `${base}/reindex-impact`,
      { schema: knowledgeReindexImpactRoute, preHandler: write },
      controller.reindexImpact,
    )
    app.put(
      `${base}/embedding-model`,
      { schema: setKnowledgeEmbeddingModelRoute, preHandler: admin },
      controller.setEmbeddingModel,
    )
    app.delete(
      `${base}/embedding-model`,
      { schema: cancelKnowledgeEmbeddingModelRoute, preHandler: admin },
      controller.cancelEmbeddingModel,
    )
    app.get(
      `${base}/access`,
      { schema: getKnowledgeAccessRoute, preHandler: write },
      controller.access,
    )
    app.put(
      `${base}/access`,
      { schema: setKnowledgeAccessRoute, preHandler: write },
      controller.setAccess,
    )
    app.get(
      `${base}/access/impact`,
      { schema: knowledgeAccessImpactRoute, preHandler: write },
      controller.accessImpact,
    )
    app.post(
      `${base}/test-search`,
      { schema: knowledgeTestSearchRoute, preHandler: write },
      controller.testSearch,
    )
    return Promise.resolve()
  }
}
