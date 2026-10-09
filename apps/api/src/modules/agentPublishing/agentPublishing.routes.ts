// SPDX-License-Identifier: AGPL-3.0-only
import { PERMISSIONS } from '@surefy/contracts'

import { startPublicRunRoute } from './agentPublishing.schema.js'

import type { AgentPublishingController } from './agentPublishing.controller.js'
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'

/**
 * The API channel (backend/agent-runs.md, §3). Reading, streaming and canceling the run it starts
 * are the run routes, which an API key shares with the workspace.
 */
export function agentPublishingRoutes(c: AgentPublishingController): FastifyPluginAsyncZod {
  return (app) => {
    const invoke = app.authorize(PERMISSIONS.AGENTS_INVOKE)
    app.post(
      '/orgs/:orgId/agents/:agentId/runs',
      { schema: startPublicRunRoute, preHandler: invoke },
      c.startRun,
    )
    return Promise.resolve()
  }
}
