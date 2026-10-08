// SPDX-License-Identifier: AGPL-3.0-only
import { PERMISSIONS } from '@surefy/contracts'

import {
  agentImpactRoute,
  archiveAgentRoute,
  createAgentRoute,
  deleteAgentRoute,
  duplicateAgentRoute,
  getAccessRoute,
  getAgentRoute,
  getDraftRoute,
  getVersionRoute,
  listAgentsRoute,
  listUsableAgentsRoute,
  listVersionsRoute,
  pauseAgentRoute,
  publishAgentRoute,
  readinessRoute,
  replaceAccessRoute,
  restoreAgentRoute,
  resumeAgentRoute,
  rollbackAgentRoute,
  saveDraftRoute,
  updateAgentRoute,
  versionDiffRoute,
} from './agents.schema.js'

import type { AgentsController } from './agents.controller.js'
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'

/**
 * Agent routes (design/workspace/agents.md, §4). The permission says what the role may do at all;
 * the service decides per agent: owning it, `agents:manage-all`, or an audience row (`edit` to
 * change it). An agent the person may not see is a 404.
 */
export function agentsRoutes(c: AgentsController): FastifyPluginAsyncZod {
  return (app) => {
    const invoke = app.authorize(PERMISSIONS.AGENTS_INVOKE)
    const read = app.authorize(PERMISSIONS.AGENTS_READ)
    const create = app.authorize(PERMISSIONS.AGENTS_CREATE)
    const edit = app.authorize(PERMISSIONS.AGENTS_EDIT)
    const publish = app.authorize(PERMISSIONS.AGENTS_PUBLISH)
    const remove = app.authorize(PERMISSIONS.AGENTS_DELETE)
    const base = '/orgs/:orgId/agents'
    const one = `${base}/:agentId`

    app.get(base, { schema: listAgentsRoute, preHandler: read }, c.list)
    app.post(base, { schema: createAgentRoute, preHandler: create }, c.create)
    app.get(`${base}/usable`, { schema: listUsableAgentsRoute, preHandler: invoke }, c.listUsable)
    app.get(one, { schema: getAgentRoute, preHandler: read }, c.get)
    app.patch(one, { schema: updateAgentRoute, preHandler: edit }, c.update)
    app.delete(one, { schema: deleteAgentRoute, preHandler: remove }, c.delete)
    app.get(`${one}/draft`, { schema: getDraftRoute, preHandler: read }, c.getDraft)
    app.put(`${one}/draft`, { schema: saveDraftRoute, preHandler: edit }, c.saveDraft)
    app.get(`${one}/impact`, { schema: agentImpactRoute, preHandler: read }, c.impact)
    app.post(`${one}/duplicate`, { schema: duplicateAgentRoute, preHandler: create }, c.duplicate)
    app.post(`${one}/pause`, { schema: pauseAgentRoute, preHandler: edit }, c.pause)
    app.post(`${one}/resume`, { schema: resumeAgentRoute, preHandler: edit }, c.resume)
    app.post(`${one}/archive`, { schema: archiveAgentRoute, preHandler: edit }, c.archive)
    app.post(`${one}/restore`, { schema: restoreAgentRoute, preHandler: edit }, c.restore)

    app.get(`${one}/readiness`, { schema: readinessRoute, preHandler: read }, c.readiness)
    app.post(`${one}/publish`, { schema: publishAgentRoute, preHandler: publish }, c.publish)
    app.post(`${one}/rollback`, { schema: rollbackAgentRoute, preHandler: publish }, c.rollback)
    app.get(`${one}/versions`, { schema: listVersionsRoute, preHandler: read }, c.listVersions)
    app.get(
      `${one}/versions/:versionId`,
      { schema: getVersionRoute, preHandler: read },
      c.getVersion,
    )
    app.get(
      `${one}/versions/:versionId/diff`,
      { schema: versionDiffRoute, preHandler: read },
      c.versionDiff,
    )

    app.get(`${one}/access`, { schema: getAccessRoute, preHandler: read }, c.getAccess)
    app.put(`${one}/access`, { schema: replaceAccessRoute, preHandler: publish }, c.replaceAccess)
    return Promise.resolve()
  }
}
