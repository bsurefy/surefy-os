// SPDX-License-Identifier: AGPL-3.0-only
import { PERMISSIONS } from '@surefy/contracts'

import {
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

import type { KnowledgeSourcesController } from './knowledgeSources.controller.js'
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'

/** Reads need `knowledge:read`; writes `knowledge:upload` and then Can manage on the base. */
export function knowledgeSourcesRoutes(
  controller: KnowledgeSourcesController,
): FastifyPluginAsyncZod {
  return (app) => {
    const read = app.authorize(PERMISSIONS.KNOWLEDGE_READ)
    const write = app.authorize(PERMISSIONS.KNOWLEDGE_UPLOAD)
    const base = '/orgs/:orgId/knowledge-bases/:baseId'
    const source = `${base}/sources/:sourceId`
    const document = `${base}/documents/:documentId`

    app.get(
      `${base}/sources`,
      { schema: listKnowledgeSourcesRoute, preHandler: read },
      controller.list,
    )
    app.post(
      `${base}/sources/files`,
      { schema: requestKnowledgeFileUploadRoute, preHandler: write },
      controller.requestUpload,
    )
    app.post(
      `${base}/sources/links`,
      { schema: createKnowledgeLinkRoute, preHandler: write },
      controller.createLink,
    )
    app.post(
      `${base}/sources/bulk`,
      { schema: bulkKnowledgeSourcesRoute, preHandler: write },
      controller.bulk,
    )
    app.get(source, { schema: getKnowledgeSourceRoute, preHandler: read }, controller.get)
    app.patch(source, { schema: updateKnowledgeSourceRoute, preHandler: write }, controller.update)
    app.delete(source, { schema: deleteKnowledgeSourceRoute, preHandler: write }, controller.delete)
    app.post(
      `${source}/complete`,
      { schema: completeKnowledgeSourceRoute, preHandler: write },
      controller.complete,
    )
    app.post(
      `${source}/retry`,
      { schema: retryKnowledgeSourceRoute, preHandler: write },
      controller.retry,
    )
    app.post(
      `${source}/sync`,
      { schema: syncKnowledgeSourceRoute, preHandler: write },
      controller.sync,
    )
    app.post(
      `${source}/restore`,
      { schema: restoreKnowledgeSourceRoute, preHandler: write },
      controller.restore,
    )
    app.get(
      `${source}/documents`,
      { schema: listKnowledgeDocumentsRoute, preHandler: read },
      controller.listDocuments,
    )
    app.get(document, { schema: getKnowledgeDocumentRoute, preHandler: read }, controller.document)
    app.get(
      `${document}/pages`,
      { schema: listKnowledgeDocumentPagesRoute, preHandler: read },
      controller.documentPages,
    )
    app.post(
      `${document}/download`,
      { schema: downloadKnowledgeDocumentRoute, preHandler: write },
      controller.download,
    )
    return Promise.resolve()
  }
}
