// SPDX-License-Identifier: AGPL-3.0-only
import { PERMISSIONS, WIDGET_SCRIPT_PATH } from '@surefy/contracts'

import {
  createChannelRoute,
  listChannelsRoute,
  pauseChannelRoute,
  removeChannelRoute,
  resumeChannelRoute,
  rotateChannelTokenRoute,
  sendWidgetMessageRoute,
  startPublicRunRoute,
  updateChannelRoute,
  widgetConfigRoute,
  widgetRunEventsRoute,
} from './agentPublishing.schema.js'

import type {
  AgentChannelsController,
  AgentPublishingController,
  WidgetController,
} from './agentPublishing.controller.js'
import type { FastifyPluginAsync } from 'fastify'
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'

/**
 * The API channel (backend/agent-runs.md, §3), the channel routes of the Publish tab, and the
 * public website widget endpoint. Reading, streaming and canceling an API run are the run routes,
 * which an API key shares with the workspace.
 */
export function agentPublishingRoutes(controllers: {
  api: AgentPublishingController
  channels: AgentChannelsController
  widget: WidgetController
}): FastifyPluginAsyncZod {
  const { api, channels, widget } = controllers
  return (app) => {
    const invoke = app.authorize(PERMISSIONS.AGENTS_INVOKE)
    app.post(
      '/orgs/:orgId/agents/:agentId/runs',
      { schema: startPublicRunRoute, preHandler: invoke },
      api.startRun,
    )

    const read = app.authorize(PERMISSIONS.AGENTS_READ)
    // Builders request external channels through an approval; changing them directly is for Admins
    const manage = app.authorize(PERMISSIONS.AGENTS_PUBLISH_EXTERNAL)
    const base = '/orgs/:orgId/agents/:agentId/channels'
    app.get(base, { schema: listChannelsRoute, preHandler: read }, channels.list)
    app.post(base, { schema: createChannelRoute, preHandler: manage }, channels.create)
    app.patch(
      `${base}/:channelId`,
      { schema: updateChannelRoute, preHandler: manage },
      channels.update,
    )
    app.delete(
      `${base}/:channelId`,
      { schema: removeChannelRoute, preHandler: manage },
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
      { schema: rotateChannelTokenRoute, preHandler: manage },
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
    return Promise.resolve()
  }
}

/** The widget script, outside `/api/v1`: `<script src="https://api.…/widget/v1/widget.js">`. */
export function widgetScriptRoutes(widget: WidgetController): FastifyPluginAsync {
  return (app) => {
    app.get(WIDGET_SCRIPT_PATH, { config: { public: true } }, widget.scriptFile)
    return Promise.resolve()
  }
}
