// SPDX-License-Identifier: AGPL-3.0-only
import { NotFoundError } from '@/core/errors/index.js'
import { resumePoint } from '@/modules/agentRuns/index.js'
import {
  ERROR_CODES,
  SLACK_SIGNATURE_HEADER,
  SLACK_TIMESTAMP_HEADER,
  WHATSAPP_SIGNATURE_HEADER,
  WIDGET_CONVERSATION_HEADER,
  WIDGET_TOKEN_HEADER,
} from '@surefy/contracts'

import { ChannelRateLimitedError } from './agentPublishing.errors.js'

import type { ApiChannel } from './agentPublishing.api.js'
import type { InboundChannels } from './agentPublishing.inbound.js'
import type { ChannelManager } from './agentPublishing.manage.js'
import type {
  createChannelRoute,
  listChannelsRoute,
  pauseChannelRoute,
  removeChannelRoute,
  resumeChannelRoute,
  rotateChannelTokenRoute,
  sendWidgetMessageRoute,
  slackEventsRoute,
  startPublicRunRoute,
  updateChannelRoute,
  whatsappEventsRoute,
  whatsappVerifyRoute,
  widgetConfigRoute,
  widgetRunEventsRoute,
} from './agentPublishing.schema.js'
import type { WidgetScript } from './agentPublishing.script.js'
import type { WidgetCaller, WidgetChannel } from './agentPublishing.widget.js'
import type { RunStreamer } from '@/modules/agentRuns/index.js'
import type { ZodReply, ZodRequest } from '@/types/fastify.js'
import type { FastifyReply, FastifyRequest } from 'fastify'

/** A refused call says when to try again (`Retry-After`), as the global rate limit does. */
async function withRetryAfter<T>(reply: FastifyReply, work: () => Promise<T>): Promise<T> {
  try {
    return await work()
  } catch (error) {
    if (error instanceof ChannelRateLimitedError) {
      void reply.header('retry-after', String(error.retryAfterSeconds))
    }
    throw error
  }
}

const raw = (reply: unknown): FastifyReply => reply as FastifyReply

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
    const { run } = await withRetryAfter(raw(reply), () =>
      this.api.start(
        tenant,
        request.params.agentId,
        request.body,
        request.headers['idempotency-key'],
      ),
    )
    if (request.query.stream) {
      const resume = resumePoint(undefined, request.headers['last-event-id'])
      return raw(reply).send(this.streamer.response(tenant, run, resume))
    }
    const data = await this.api.view(tenant, run.id)
    return reply
      .status(202)
      .header('location', `/api/v1/orgs/${tenant.orgId}/runs/${run.id}`)
      .send({ data })
  }
}

/** The channel routes of the Publish tab. */
export class AgentChannelsController {
  constructor(private readonly channels: ChannelManager) {}

  list = async (
    request: ZodRequest<typeof listChannelsRoute>,
    reply: ZodReply<typeof listChannelsRoute>,
  ) => {
    reply.ok(await this.channels.list(request.tenant, request.params.agentId))
  }

  create = async (
    request: ZodRequest<typeof createChannelRoute>,
    reply: ZodReply<typeof createChannelRoute>,
  ) => {
    reply.created(await this.channels.create(request.tenant, request.params.agentId, request.body))
  }

  update = async (
    request: ZodRequest<typeof updateChannelRoute>,
    reply: ZodReply<typeof updateChannelRoute>,
  ) => {
    const { agentId, channelId } = request.params
    reply.ok(await this.channels.update(request.tenant, agentId, channelId, request.body))
  }

  pause = async (
    request: ZodRequest<typeof pauseChannelRoute>,
    reply: ZodReply<typeof pauseChannelRoute>,
  ) => {
    const { agentId, channelId } = request.params
    reply.ok(await this.channels.pause(request.tenant, agentId, channelId))
  }

  resume = async (
    request: ZodRequest<typeof resumeChannelRoute>,
    reply: ZodReply<typeof resumeChannelRoute>,
  ) => {
    const { agentId, channelId } = request.params
    reply.ok(await this.channels.resume(request.tenant, agentId, channelId))
  }

  rotateToken = async (
    request: ZodRequest<typeof rotateChannelTokenRoute>,
    reply: ZodReply<typeof rotateChannelTokenRoute>,
  ) => {
    const { agentId, channelId } = request.params
    reply.ok(await this.channels.rotateToken(request.tenant, agentId, channelId))
  }

  remove = async (
    request: ZodRequest<typeof removeChannelRoute>,
    reply: ZodReply<typeof removeChannelRoute>,
  ) => {
    const { agentId, channelId } = request.params
    await this.channels.remove(request.tenant, agentId, channelId)
    reply.noContent()
  }
}

const callerOf = (
  request: FastifyRequest,
  headers: { [WIDGET_TOKEN_HEADER]?: string; origin?: string },
): WidgetCaller => ({
  token: headers[WIDGET_TOKEN_HEADER],
  origin: headers.origin,
  ip: request.ip,
  requestId: request.id,
  userAgent: request.headers['user-agent'],
})

/** The public widget endpoint: no session, the widget token instead. */
export class WidgetController {
  constructor(
    private readonly widget: WidgetChannel,
    private readonly script: () => Promise<WidgetScript | null>,
  ) {}

  config = async (
    request: ZodRequest<typeof widgetConfigRoute>,
    reply: ZodReply<typeof widgetConfigRoute>,
  ) => {
    reply.ok(await this.widget.config(callerOf(request, request.headers)))
  }

  send = async (
    request: ZodRequest<typeof sendWidgetMessageRoute>,
    reply: ZodReply<typeof sendWidgetMessageRoute>,
  ) => {
    const caller = callerOf(request, request.headers)
    const response = await withRetryAfter(raw(reply), () => this.widget.send(caller, request.body))
    return raw(reply).send(response)
  }

  events = async (
    request: ZodRequest<typeof widgetRunEventsRoute>,
    reply: ZodReply<typeof widgetRunEventsRoute>,
  ) => {
    const { headers } = request
    const response = await this.widget.reattach(
      callerOf(request, headers),
      request.params.runId,
      headers[WIDGET_CONVERSATION_HEADER],
      headers['last-event-id'],
    )
    return raw(reply).send(response)
  }

  /**
   * `@surefy/widget`'s script for any website: cacheable for a few minutes and revalidated by its
   * ETag, so a new release reaches every site soon after an update.
   */
  scriptFile = async (request: FastifyRequest, reply: FastifyReply) => {
    const script = await this.script()
    if (script === null) throw new NotFoundError(ERROR_CODES.NOT_FOUND, 'The widget is not built')
    void reply
      .header('cache-control', 'public, max-age=300')
      .header('etag', script.etag)
      .header('cross-origin-resource-policy', 'cross-origin')
      .header('access-control-allow-origin', '*')
    if (request.headers['if-none-match'] === script.etag) return reply.status(304).send()
    return reply.type('text/javascript; charset=utf-8').send(script.body)
  }
}

/** Slack and WhatsApp deliveries: raw bodies, provider signatures, an answer at once. */
export class ChannelWebhooksController {
  constructor(private readonly inbound: InboundChannels) {}

  slack = async (
    request: ZodRequest<typeof slackEventsRoute>,
    reply: ZodReply<typeof slackEventsRoute>,
  ) => {
    const answer = await this.inbound.slack({
      body: rawBody(request.body),
      signature: request.headers[SLACK_SIGNATURE_HEADER],
      timestamp: request.headers[SLACK_TIMESTAMP_HEADER],
    })
    if (answer === null) return raw(reply).status(200).send()
    return raw(reply).status(200).type('text/plain; charset=utf-8').send(answer.challenge)
  }

  whatsappVerify = async (
    request: ZodRequest<typeof whatsappVerifyRoute>,
    reply: ZodReply<typeof whatsappVerifyRoute>,
  ) => {
    const { query } = request
    const challenge = this.inbound.whatsappVerify({
      ...(query['hub.mode'] === undefined ? {} : { mode: query['hub.mode'] }),
      ...(query['hub.verify_token'] === undefined ? {} : { token: query['hub.verify_token'] }),
      ...(query['hub.challenge'] === undefined ? {} : { challenge: query['hub.challenge'] }),
    })
    return raw(reply).status(200).type('text/plain; charset=utf-8').send(challenge)
  }

  whatsapp = async (
    request: ZodRequest<typeof whatsappEventsRoute>,
    reply: ZodReply<typeof whatsappEventsRoute>,
  ) => {
    await this.inbound.whatsapp({
      body: rawBody(request.body),
      signature: request.headers[WHATSAPP_SIGNATURE_HEADER],
    })
    return raw(reply).status(200).send()
  }
}

const rawBody = (body: unknown): Buffer => (Buffer.isBuffer(body) ? body : Buffer.alloc(0))
