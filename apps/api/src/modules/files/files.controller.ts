// SPDX-License-Identifier: AGPL-3.0-only
import type { downloadFileRoute, uploadFileRoute } from './files.schema.js'
import type { FilesService } from './files.service.js'
import type { ZodReply, ZodRequest } from '@/types/fastify.js'
import type { Readable } from 'node:stream'

type Download = typeof downloadFileRoute
type Upload = typeof uploadFileRoute

export class FilesController {
  constructor(private readonly files: FilesService) {}

  download = async (request: ZodRequest<Download>, reply: ZodReply<Download>) => {
    const { stream, disposition } = await this.files.download(request.query)
    return reply
      .header('content-type', 'application/octet-stream')
      .header('content-disposition', disposition)
      .header('x-content-type-options', 'nosniff')
      .header('cache-control', 'private, no-store')
      .send(stream)
  }

  upload = async (request: ZodRequest<Upload>, reply: ZodReply<Upload>) => {
    await this.files.upload(
      request.query,
      request.headers['content-type'],
      request.body as Readable,
    )
    reply.noContent()
  }
}
