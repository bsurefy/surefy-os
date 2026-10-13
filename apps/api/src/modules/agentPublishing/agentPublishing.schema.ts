// SPDX-License-Identifier: AGPL-3.0-only
import { z } from 'zod'

import {
  agentChannelCreatedDtoSchema,
  agentChannelDtoSchema,
  agentChannelListDtoSchema,
  agentChannelParamsSchema,
  agentParamsSchema,
  agentRunStreamQuerySchema,
  createAgentChannelInputSchema,
  okResponse,
  publicRunDtoSchema,
  publicRunInputSchema,
  publicRunParamsSchema,
  sendWidgetMessageInputSchema,
  SLACK_SIGNATURE_HEADER,
  SLACK_TIMESTAMP_HEADER,
  updateAgentChannelInputSchema,
  WHATSAPP_SIGNATURE_HEADER,
  WIDGET_CONVERSATION_HEADER,
  WIDGET_TOKEN_HEADER,
  widgetConfigDtoSchema,
  widgetRunParamsSchema,
} from '@surefy/contracts'

const TAGS = ['agent runs']
const CHANNEL_TAGS = ['agent channels']
const WIDGET_TAGS = ['website widget']

/**
 * `202` with the run and a `Location` header, or `200 text/event-stream` with `?stream=true`
 * (the event stream of the run, see contracts `stream.ts`).
 */
export const startPublicRunRoute = {
  tags: TAGS,
  summary: "Starts a run of a published agent over the API channel (API key with 'agents:invoke')",
  params: publicRunParamsSchema,
  querystring: agentRunStreamQuerySchema,
  headers: z.object({ 'idempotency-key': z.string().trim().min(1).max(255).optional() }),
  body: publicRunInputSchema,
  response: { 202: okResponse(publicRunDtoSchema) },
}

// ── Channels ────────────────────────────────────────────────────────────────────────────────────

export const listChannelsRoute = {
  tags: CHANNEL_TAGS,
  summary: "Lists an agent's channels; a widget token is never shown here",
  params: agentParamsSchema,
  response: { 200: okResponse(agentChannelListDtoSchema) },
}

export const createChannelRoute = {
  tags: CHANNEL_TAGS,
  summary: 'Turns an API or website widget channel on for a published agent',
  description: 'A widget channel answers with its token, once.',
  params: agentParamsSchema,
  body: createAgentChannelInputSchema,
  response: { 201: okResponse(agentChannelCreatedDtoSchema) },
}

export const updateChannelRoute = {
  tags: CHANNEL_TAGS,
  summary: "Changes a channel's settings (the block of its own type)",
  params: agentChannelParamsSchema,
  body: updateAgentChannelInputSchema,
  response: { 200: okResponse(agentChannelDtoSchema) },
}

export const pauseChannelRoute = {
  tags: CHANNEL_TAGS,
  summary: 'Pauses a channel: it stops answering until resumed',
  params: agentChannelParamsSchema,
  response: { 200: okResponse(agentChannelDtoSchema) },
}

export const resumeChannelRoute = {
  tags: CHANNEL_TAGS,
  summary: 'Resumes a paused channel',
  params: agentChannelParamsSchema,
  response: { 200: okResponse(agentChannelDtoSchema) },
}

export const rotateChannelTokenRoute = {
  tags: CHANNEL_TAGS,
  summary: "Replaces a website widget's token; the previous one stops working at once",
  params: agentChannelParamsSchema,
  response: { 200: okResponse(agentChannelCreatedDtoSchema) },
}

export const removeChannelRoute = {
  tags: CHANNEL_TAGS,
  summary: 'Removes a channel; a widget token stops working at once',
  params: agentChannelParamsSchema,
}

// ── Website widget (public) ─────────────────────────────────────────────────────────────────────

/** The token is checked by the endpoint (401 `AGENT_WIDGET_TOKEN_INVALID`), not as a validation error. */
const widgetHeaders = z.object({
  [WIDGET_TOKEN_HEADER]: z.string().max(200).optional(),
  origin: z.string().max(300).optional(),
})

export const widgetConfigRoute = {
  tags: WIDGET_TAGS,
  summary: 'What the website widget shows before the first message (widget token)',
  headers: widgetHeaders,
  response: { 200: okResponse(widgetConfigDtoSchema) },
}

/** `200 text/event-stream` with the widget's events (contracts `agents/widget.ts`). */
export const sendWidgetMessageRoute = {
  tags: WIDGET_TAGS,
  summary: "Sends a visitor's message and streams the answer (widget token)",
  headers: widgetHeaders,
  body: sendWidgetMessageInputSchema,
}

export const widgetRunEventsRoute = {
  tags: WIDGET_TAGS,
  summary: 'Reattaches to the answer of a run that waited for a person (widget token)',
  headers: widgetHeaders.extend({
    [WIDGET_CONVERSATION_HEADER]: z.uuid(),
    'last-event-id': z.string().max(100).optional(),
  }),
  params: widgetRunParamsSchema,
}

// ── Slack and WhatsApp (public) ─────────────────────────────────────────────────────────────────

const CHANNEL_WEBHOOK_TAGS = ['agent channel webhooks']

/** The body stays raw bytes: the signature is over them. */
export const slackEventsRoute = {
  tags: CHANNEL_WEBHOOK_TAGS,
  summary: "Slack's events for the agents' Slack channels (signed with the Slack app's secret)",
  headers: z.object({
    [SLACK_SIGNATURE_HEADER]: z.string().max(200).optional(),
    [SLACK_TIMESTAMP_HEADER]: z.string().max(20).optional(),
  }),
}

export const whatsappVerifyRoute = {
  tags: CHANNEL_WEBHOOK_TAGS,
  summary: "Meta's webhook set-up check for a WhatsApp channel (the channel's verify token)",
  querystring: z.object({
    'hub.mode': z.string().max(50).optional(),
    'hub.verify_token': z.string().max(200).optional(),
    'hub.challenge': z.string().max(200).optional(),
  }),
}

export const whatsappEventsRoute = {
  tags: CHANNEL_WEBHOOK_TAGS,
  summary: "WhatsApp's messages for the agents' WhatsApp channels (signed with the app secret)",
  headers: z.object({ [WHATSAPP_SIGNATURE_HEADER]: z.string().max(200).optional() }),
}
