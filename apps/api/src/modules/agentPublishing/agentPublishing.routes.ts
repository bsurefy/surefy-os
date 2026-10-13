// SPDX-License-Identifier: AGPL-3.0-only
import {
  PERMISSIONS,
  SLACK_EVENTS_PATH,
  WHATSAPP_WEBHOOK_PATH,
  WIDGET_SCRIPT_PATH,
} from '@surefy/contracts'

import { CHANNEL_WEBHOOK_BODY_LIMIT } from './agentPublishing.constants.js'
import {
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

import type {
  AgentChannelsController,
  AgentPublishingController,
  ChannelWebhooksController,
  WidgetController,
} from './agentPublishing.controller.js'
import type { FastifyPluginAsync } from 'fastify'
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'

/**
 * The API channel (backend/agent-runs.md, §3), the channel routes of the Publish tab, the public
 * website widget endpoint, and the Slack and WhatsApp webhooks. Reading, streaming and canceling an API run are the run routes,
 * which an API key shares with the workspace.
 */
export function agentPublishingRoutes(controllers: {
  api: AgentPublishingController
  channels: AgentChannelsController
  widget: WidgetController
  webhooks: ChannelWebhooksController
}): FastifyPluginAsyncZod {
  const { api, channels, widget, webhooks } = controllers
  return async (app) => {
    const invoke = app.authorize(PERMISSIONS.AGENTS_INVOKE)
    app.post(
      '/orgs/:orgId/agents/:agentId/runs',
      { schema: startPublicRunRoute, preHandler: invoke },
      api.startRun,
    )

    const read = app.authorize(PERMISSIONS.AGENTS_READ)
    // Builders ask for channels (an approval request), take back a request and issue the token of
    // a widget approved for them; the service applies those limits. Changing a channel is for Admins.
    const request = app.authorize(PERMISSIONS.AGENTS_PUBLISH)
    const manage = app.authorize(PERMISSIONS.AGENTS_PUBLISH_EXTERNAL)
    const base = '/orgs/:orgId/agents/:agentId/channels'
    app.get(base, { schema: listChannelsRoute, preHandler: read }, channels.list)
    app.post(base, { schema: createChannelRoute, preHandler: request }, channels.create)
    app.patch(
      `${base}/:channelId`,
      { schema: updateChannelRoute, preHandler: manage },
      channels.update,
    )
    app.delete(
      `${base}/:channelId`,
      { schema: removeChannelRoute, preHandler: request },
      channels.remove,
    )
    app.post(
      `${base}/:channelId/pause`,
      { schema: pauseChannelRoute, preHandler: manage },
      channels.pause,
    )
    app.post(
      `${base}/:channelId/resume`,
      { schema: resumeChannelRoute, preHandler: manage },
      channels.resume,
    )
    app.post(
      `${base}/:channelId/rotate-token`,
      { schema: rotateChannelTokenRoute, preHandler: request },
      channels.rotateToken,
    )

    // The website widget: the channel token instead of a session; its own rate limits per channel
    // and per visitor apply to messages, the global per-address limit to everything.
    const open = { public: true }
    app.get('/widget/config', { schema: widgetConfigRoute, config: open }, widget.config)
    app.post('/widget/messages', { schema: sendWidgetMessageRoute, config: open }, widget.send)
    app.get(
      '/widget/runs/:runId/events',
      { schema: widgetRunEventsRoute, config: open },
      widget.events,
    )

    // Slack and WhatsApp: the signature is over the raw bytes, so these routes get their own
    // context whose JSON parser keeps the body as a buffer.
    await app.register((hooks) => {
      hooks.removeContentTypeParser('application/json')
      hooks.addContentTypeParser(
        'application/json',
        { parseAs: 'buffer', bodyLimit: CHANNEL_WEBHOOK_BODY_LIMIT },
        (_request, body, done) => {
          done(null, body)
        },
      )
      hooks.post(
        withinApi(SLACK_EVENTS_PATH),
        { schema: slackEventsRoute, config: open },
        webhooks.slack,
      )
      hooks.get(
        withinApi(WHATSAPP_WEBHOOK_PATH),
        { schema: whatsappVerifyRoute, config: open },
        webhooks.whatsappVerify,
      )
      hooks.post(
        withinApi(WHATSAPP_WEBHOOK_PATH),
        { schema: whatsappEventsRoute, config: open },
        webhooks.whatsapp,
      )
      return Promise.resolve()
    })
  }
}

/** The contract's paths include `/api/v1`; these routes are registered under it. */
const withinApi = (path: string): string => path.slice('/api/v1'.length)

/** The widget script, outside `/api/v1`: `<script src="https://api.…/widget/v1/widget.js">`. */
export function widgetScriptRoutes(widget: WidgetController): FastifyPluginAsync {
  return (app) => {
    app.get(WIDGET_SCRIPT_PATH, { config: { public: true } }, widget.scriptFile)
    return Promise.resolve()
  }
}
