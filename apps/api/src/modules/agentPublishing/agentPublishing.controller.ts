// SPDX-License-Identifier: AGPL-3.0-only
import { resumePoint } from '@/modules/agentRuns/index.js'

import type { ApiChannel } from './agentPublishing.api.js'
import type { startPublicRunRoute } from './agentPublishing.schema.js'
import type { RunStreamer } from '@/modules/agentRuns/index.js'
import type { ZodReply, ZodRequest } from '@/types/fastify.js'
import type { FastifyReply } from 'fastify'

/** Thin handler: the request in, one channel call, the reply out (controllers.md). */
export class AgentPublishingController {
  constructor(
    private readonly api: ApiChannel,
    private readonly streamer: RunStreamer,
  ) {}

  startRun = async (
    request: ZodRequest<typeof startPublicRunRoute>,
    reply: ZodReply<typeof startPublicRunRoute>,
  ) => {
    const { tenant } = request
    const { run } = await this.api.start(
      tenant,
      request.params.agentId,
      request.body,
      request.headers['idempotency-key'],
    )
    if (request.query.stream) {
      const resume = resumePoint(undefined, request.headers['last-event-id'])
      return (reply as unknown as FastifyReply).send(this.streamer.response(tenant, run, resume))
    }
    const data = await this.api.view(tenant, run.id)
    return reply
      .status(202)
      .header('location', `/api/v1/orgs/${tenant.orgId}/runs/${run.id}`)
      .send({ data })
  }
}
