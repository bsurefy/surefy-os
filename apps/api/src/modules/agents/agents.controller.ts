// SPDX-License-Identifier: AGPL-3.0-only
import type { AgentAudience } from './agents.audience.js'
import type { AgentPublishing } from './agents.publishing.js'
import type {
  agentImpactRoute,
  archiveAgentRoute,
  createAgentRoute,
  deleteAgentRoute,
  discoverMcpActionsRoute,
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
  testAgentToolRoute,
  updateAgentRoute,
  versionDiffRoute,
} from './agents.schema.js'
import type { AgentsService } from './agents.service.js'
import type { AgentToolsTry } from './agents.tools.js'
import type { ZodReply, ZodRequest } from '@/types/fastify.js'

/** Thin handlers: the request in, one service call, the reply out (controllers.md). */
export class AgentsController {
  constructor(
    private readonly agents: AgentsService,
    private readonly publishing: AgentPublishing,
    private readonly audience: AgentAudience,
    private readonly tools: AgentToolsTry,
  ) {}

  list = async (
    request: ZodRequest<typeof listAgentsRoute>,
    reply: ZodReply<typeof listAgentsRoute>,
  ) => {
    const { items, nextCursor } = await this.agents.list(request.tenant, request.query)
    reply.page(items, nextCursor)
  }

  listUsable = async (
    request: ZodRequest<typeof listUsableAgentsRoute>,
    reply: ZodReply<typeof listUsableAgentsRoute>,
  ) => {
    const { items, nextCursor } = await this.agents.listUsable(request.tenant, request.query)
    reply.page(items, nextCursor)
  }

  create = async (
    request: ZodRequest<typeof createAgentRoute>,
    reply: ZodReply<typeof createAgentRoute>,
  ) => {
    reply.created(await this.agents.create(request.tenant, request.body))
  }

  get = async (
    request: ZodRequest<typeof getAgentRoute>,
    reply: ZodReply<typeof getAgentRoute>,
  ) => {
    reply.ok(await this.agents.get(request.tenant, request.params.agentId))
  }

  update = async (
    request: ZodRequest<typeof updateAgentRoute>,
    reply: ZodReply<typeof updateAgentRoute>,
  ) => {
    reply.ok(await this.agents.update(request.tenant, request.params.agentId, request.body))
  }

  delete = async (
    request: ZodRequest<typeof deleteAgentRoute>,
    reply: ZodReply<typeof deleteAgentRoute>,
  ) => {
    await this.agents.delete(request.tenant, request.params.agentId, request.query)
    reply.noContent()
  }

  getDraft = async (
    request: ZodRequest<typeof getDraftRoute>,
    reply: ZodReply<typeof getDraftRoute>,
  ) => {
    reply.ok(await this.agents.getDraft(request.tenant, request.params.agentId))
  }

  saveDraft = async (
    request: ZodRequest<typeof saveDraftRoute>,
    reply: ZodReply<typeof saveDraftRoute>,
  ) => {
    reply.ok(await this.agents.saveDraft(request.tenant, request.params.agentId, request.body))
  }

  impact = async (
    request: ZodRequest<typeof agentImpactRoute>,
    reply: ZodReply<typeof agentImpactRoute>,
  ) => {
    reply.ok(await this.agents.impact(request.tenant, request.params.agentId, request.query))
  }

  duplicate = async (
    request: ZodRequest<typeof duplicateAgentRoute>,
    reply: ZodReply<typeof duplicateAgentRoute>,
  ) => {
    reply.created(await this.agents.duplicate(request.tenant, request.params.agentId, request.body))
  }

  pause = async (
    request: ZodRequest<typeof pauseAgentRoute>,
    reply: ZodReply<typeof pauseAgentRoute>,
  ) => {
    reply.ok(await this.agents.pause(request.tenant, request.params.agentId))
  }

  resume = async (
    request: ZodRequest<typeof resumeAgentRoute>,
    reply: ZodReply<typeof resumeAgentRoute>,
  ) => {
    reply.ok(await this.agents.resume(request.tenant, request.params.agentId))
  }

  archive = async (
    request: ZodRequest<typeof archiveAgentRoute>,
    reply: ZodReply<typeof archiveAgentRoute>,
  ) => {
    reply.ok(await this.agents.archive(request.tenant, request.params.agentId))
  }

  restore = async (
    request: ZodRequest<typeof restoreAgentRoute>,
    reply: ZodReply<typeof restoreAgentRoute>,
  ) => {
    reply.ok(await this.agents.restore(request.tenant, request.params.agentId))
  }

  readiness = async (
    request: ZodRequest<typeof readinessRoute>,
    reply: ZodReply<typeof readinessRoute>,
  ) => {
    reply.ok(await this.publishing.readiness(request.tenant, request.params.agentId))
  }

  publish = async (
    request: ZodRequest<typeof publishAgentRoute>,
    reply: ZodReply<typeof publishAgentRoute>,
  ) => {
    reply.ok(await this.publishing.publish(request.tenant, request.params.agentId, request.body))
  }

  rollback = async (
    request: ZodRequest<typeof rollbackAgentRoute>,
    reply: ZodReply<typeof rollbackAgentRoute>,
  ) => {
    reply.ok(await this.publishing.rollback(request.tenant, request.params.agentId, request.body))
  }

  listVersions = async (
    request: ZodRequest<typeof listVersionsRoute>,
    reply: ZodReply<typeof listVersionsRoute>,
  ) => {
    const { items, nextCursor } = await this.publishing.listVersions(
      request.tenant,
      request.params.agentId,
      request.query,
    )
    reply.page(items, nextCursor)
  }

  getVersion = async (
    request: ZodRequest<typeof getVersionRoute>,
    reply: ZodReply<typeof getVersionRoute>,
  ) => {
    const { agentId, versionId } = request.params
    reply.ok(await this.publishing.getVersion(request.tenant, agentId, versionId))
  }

  versionDiff = async (
    request: ZodRequest<typeof versionDiffRoute>,
    reply: ZodReply<typeof versionDiffRoute>,
  ) => {
    const { agentId, versionId } = request.params
    reply.ok(await this.publishing.diff(request.tenant, agentId, versionId, request.query))
  }

  getAccess = async (
    request: ZodRequest<typeof getAccessRoute>,
    reply: ZodReply<typeof getAccessRoute>,
  ) => {
    reply.ok(await this.audience.get(request.tenant, request.params.agentId))
  }

  replaceAccess = async (
    request: ZodRequest<typeof replaceAccessRoute>,
    reply: ZodReply<typeof replaceAccessRoute>,
  ) => {
    reply.ok(await this.audience.replace(request.tenant, request.params.agentId, request.body))
  }

  testTool = async (
    request: ZodRequest<typeof testAgentToolRoute>,
    reply: ZodReply<typeof testAgentToolRoute>,
  ) => {
    reply.ok(await this.tools.test(request.tenant, request.params.agentId, request.body))
  }

  discoverTools = async (
    request: ZodRequest<typeof discoverMcpActionsRoute>,
    reply: ZodReply<typeof discoverMcpActionsRoute>,
  ) => {
    reply.ok(await this.tools.discover(request.tenant, request.params.agentId, request.body))
  }
}
