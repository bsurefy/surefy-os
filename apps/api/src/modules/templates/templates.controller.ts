// SPDX-License-Identifier: AGPL-3.0-only
import type { listTemplatesRoute } from './templates.schema.js'
import type { TemplatesService } from './templates.service.js'
import type { ZodReply, ZodRequest } from '@/types/fastify.js'

type ListTemplates = typeof listTemplatesRoute

export class TemplatesController {
  constructor(private readonly service: TemplatesService) {}

  list = async (request: ZodRequest<ListTemplates>, reply: ZodReply<ListTemplates>) => {
    reply.ok(await this.service.list(request.tenant))
  }
}
