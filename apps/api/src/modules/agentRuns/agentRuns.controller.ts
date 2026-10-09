// SPDX-License-Identifier: AGPL-3.0-only
import { resumePoint } from './agentRuns.streamer.js'

import type { AgentRunsQueries } from './agentRuns.queries.js'
import type {
  agentRunEventsRoute,
  cancelAgentRunRoute,
  getAgentRunRoute,
  getAgentRunStepRoute,
  listAgentRunsOfAgentRoute,
  listAgentRunsRoute,
  listAgentRunStepsRoute,
  retryAgentRunRoute,
  startTestRunRoute,
} from './agentRuns.schema.js'
import type { AgentRunsService } from './agentRuns.service.js'
import type { RunStreamer } from './agentRuns.streamer.js'
import type { RunRow } from './agentRuns.types.js'
import type { ZodReply, ZodRequest } from '@/types/fastify.js'
import type { FastifyReply, FastifyRequest } from 'fastify'

export interface AgentRunsControllerDeps {
  service: AgentRunsService
  queries: AgentRunsQueries
  streamer: RunStreamer
}

type Tenant = FastifyRequest['tenant']

/** Thin handlers: the request in, one service call, the reply out (controllers.md). */
export class AgentRunsController {
  constructor(private readonly deps: AgentRunsControllerDeps) {}

  list = async (
    request: ZodRequest<typeof listAgentRunsRoute>,
    reply: ZodReply<typeof listAgentRunsRoute>,
  ) => {
    const { items, nextCursor } = await this.deps.queries.list(request.tenant, request.query)
    reply.page(items, nextCursor)
  }

  listForAgent = async (
    request: ZodRequest<typeof listAgentRunsOfAgentRoute>,
    reply: ZodReply<typeof listAgentRunsOfAgentRoute>,
  ) => {
    const { items, nextCursor } = await this.deps.queries.list(
      request.tenant,
      request.query,
      request.params.agentId,
    )
    reply.page(items, nextCursor)
  }

  get = async (
    request: ZodRequest<typeof getAgentRunRoute>,
    reply: ZodReply<typeof getAgentRunRoute>,
  ) => {
    reply.ok(await this.view(request.tenant, request.params.runId))
  }

  steps = async (
    request: ZodRequest<typeof listAgentRunStepsRoute>,
    reply: ZodReply<typeof listAgentRunStepsRoute>,
  ) => {
    reply.ok(await this.deps.queries.steps(request.tenant, request.params.runId))
  }

  step = async (
    request: ZodRequest<typeof getAgentRunStepRoute>,
    reply: ZodReply<typeof getAgentRunStepRoute>,
  ) => {
    const { runId, seq } = request.params
    reply.ok(await this.deps.queries.step(request.tenant, runId, seq))
  }

  cancel = async (
    request: ZodRequest<typeof cancelAgentRunRoute>,
    reply: ZodReply<typeof cancelAgentRunRoute>,
  ) => {
    await this.deps.service.cancel(request.tenant, request.params.runId)
    reply.ok(await this.view(request.tenant, request.params.runId))
  }

  retry = async (
    request: ZodRequest<typeof retryAgentRunRoute>,
    reply: ZodReply<typeof retryAgentRunRoute>,
  ) => {
    const run = await this.deps.service.retry(request.tenant, request.params.runId, request.body)
    reply.created(await this.deps.queries.get(request.tenant, run.id))
  }

  startTest = async (
    request: ZodRequest<typeof startTestRunRoute>,
    reply: ZodReply<typeof startTestRunRoute>,
  ) => {
    const run = await this.deps.service.start(request.tenant, {
      agentId: request.params.agentId,
      trigger: 'test',
      input: { messages: request.body.messages },
    })
    if (request.query.stream) return this.sendStream(request, reply, run)
    reply.created(await this.deps.queries.get(request.tenant, run.id))
  }

  events = async (
    request: ZodRequest<typeof agentRunEventsRoute>,
    reply: ZodReply<typeof agentRunEventsRoute>,
  ) => {
    const run = await this.deps.queries.access(request.tenant, request.params.runId)
    return this.sendStream(request, reply, run, request.query.after)
  }

  /** The person's detail view, or the public view for an API key. */
  private view(tenant: Tenant, runId: string) {
    return tenant.apiKey === undefined
      ? this.deps.queries.get(tenant, runId)
      : this.deps.queries.getPublic(tenant, runId)
  }

  private sendStream(request: FastifyRequest, reply: FastifyReply, run: RunRow, after?: string) {
    const resume = resumePoint(after, request.headers['last-event-id'])
    return reply.send(this.deps.streamer.response(request.tenant, run, resume))
  }
}
