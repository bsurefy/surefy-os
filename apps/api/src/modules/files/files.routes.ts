// SPDX-License-Identifier: AGPL-3.0-only
import { downloadFileRoute, uploadFileRoute } from './files.schema.js'

import type { FilesController } from './files.controller.js'
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'

/** Largest body the route reads; the signature fixes the real size, which is at most the knowledge file limit. */
const UPLOAD_BODY_LIMIT = 512 * 1024 * 1024

/**
 * `GET` and `PUT /api/v1/files`: public on purpose, because the signature in the query is the
 * authorization (it names the key, the method and, for uploads, the type and size). The body of
 * a PUT is handed on as a stream, whatever its content type.
 */
export function filesRoutes(controller: FilesController): FastifyPluginAsyncZod {
  return (app) => {
    app.addContentTypeParser('*', (_request, payload, done) => {
      done(null, payload)
    })
    app.get('/files', { schema: downloadFileRoute, config: { public: true } }, controller.download)
    app.put(
      '/files',
      { schema: uploadFileRoute, config: { public: true }, bodyLimit: UPLOAD_BODY_LIMIT },
      controller.upload,
    )
    return Promise.resolve()
  }
}
