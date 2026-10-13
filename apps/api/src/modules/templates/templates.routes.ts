// SPDX-License-Identifier: AGPL-3.0-only
import { PERMISSIONS } from '@surefy/contracts'

import { listTemplatesRoute } from './templates.schema.js'

import type { TemplatesController } from './templates.controller.js'
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'

/** `GET /orgs/:orgId/agents/templates`: the "New agent" dialog; the agents screens' permission applies. */
export function templatesRoutes(c: TemplatesController): FastifyPluginAsyncZod {
  return (app) => {
    app.get(
      '/orgs/:orgId/agents/templates',
      { schema: listTemplatesRoute, preHandler: app.authorize(PERMISSIONS.AGENTS_READ) },
      c.list,
    )
    return Promise.resolve()
  }
}
