// SPDX-License-Identifier: AGPL-3.0-only
import { z } from 'zod'

import { agentParamsSchema } from './access.js'
import { userRefDtoSchema } from '../auth/schemas.js'

// Where a published agent answers (database/agents-and-runs.md §4; Agents › Editor › Publish).
// Routes, under /api/v1/orgs/:orgId/agents/:agentId/channels:
// GET / · POST / · PATCH/DELETE /:channelId · POST …/:channelId/{pause,resume,rotate-token}.
// SurefyOS chat is created with the first publish. An Admin publishes an external channel
// directly; a Builder's request is `pending_approval` until the `channel_publish` approval is
// decided. The API channel authenticates with organization API keys, not a channel token.

export const AGENT_CHANNEL_TYPES = ['workspace_chat', 'api', 'widget', 'slack', 'whatsapp'] as const
export type AgentChannelType = (typeof AGENT_CHANNEL_TYPES)[number]

/** Channels that reach people outside the signed-in workspace: publishing needs an approval for Builders. */
export const EXTERNAL_CHANNEL_TYPES = ['api', 'widget', 'slack', 'whatsapp'] as const
export type ExternalChannelType = (typeof EXTERNAL_CHANNEL_TYPES)[number]

/**
 * `pending_approval → active ⇄ paused`; `pending_approval → disconnected` (rejected);
 * `active → error` (provider error or expired connection) `→ active` (reconnect); any → `disconnected`.
 */
export const AGENT_CHANNEL_STATUSES = [
  'pending_approval',
  'active',
  'paused',
  'error',
  'disconnected',
] as const
export type AgentChannelStatus = (typeof AGENT_CHANNEL_STATUSES)[number]

export const WIDGET_ORIGINS_MAX = 20
export const WIDGET_POSITIONS = ['bottom_right', 'bottom_left'] as const
export const WIDGET_THEMES = ['light', 'dark', 'auto'] as const
export const SLACK_RESPOND_TO = ['mentions', 'direct_messages'] as const

export const widgetChannelConfigSchema = z.object({
  /** Origins (`https://acme.com`) the widget may load on. */
  allowedOrigins: z
    .array(z.url({ protocol: /^https?$/ }).max(300))
    .min(1)
    .max(WIDGET_ORIGINS_MAX),
  greeting: z.string().max(300),
  theme: z.enum(WIDGET_THEMES),
  position: z.enum(WIDGET_POSITIONS),
})
export type WidgetChannelConfig = z.infer<typeof widgetChannelConfigSchema>

export const apiChannelConfigSchema = z.object({
  rateLimitPerMinute: z.number().int().min(1).max(6000),
})
export type ApiChannelConfig = z.infer<typeof apiChannelConfigSchema>

export const slackChannelConfigSchema = z.object({
  channelIds: z.array(z.string().min(1).max(50)).max(100),
  respondTo: z.enum(SLACK_RESPOND_TO),
})
export type SlackChannelConfig = z.infer<typeof slackChannelConfigSchema>

export const whatsappChannelConfigSchema = z.object({
  businessAccountId: z.string().min(1).max(100),
  welcomeMessage: z.string().max(1000),
})
export type WhatsappChannelConfig = z.infer<typeof whatsappChannelConfigSchema>

/**
 * What anonymous users can reach, captured when the channel was published: "Anyone using the
 * website widget can get answers from HR Policies".
 */
export const channelExposureSchema = z.object({
  knowledgeBases: z.array(z.object({ id: z.uuid(), name: z.string() })).max(50),
  tools: z.array(z.object({ id: z.uuid(), name: z.string() })).max(50),
})
export type ChannelExposure = z.infer<typeof channelExposureSchema>

/** `AgentChannelConfig` v1: only the block of the channel's own type is set. */
export const agentChannelConfigSchema = z.object({
  version: z.literal(1),
  widget: widgetChannelConfigSchema.optional(),
  api: apiChannelConfigSchema.optional(),
  slack: slackChannelConfigSchema.optional(),
  whatsapp: whatsappChannelConfigSchema.optional(),
  exposure: channelExposureSchema.optional(),
})
export type AgentChannelConfig = z.infer<typeof agentChannelConfigSchema>

/** Where the provider delivers events, for the Publish tab's set-up steps (Slack, WhatsApp). */
export const agentChannelWebhookDtoSchema = z.object({
  url: z.url(),
  /** WhatsApp only: the token Meta's webhook set-up asks for. */
  verifyToken: z.string().nullable(),
})
export type AgentChannelWebhookDto = z.infer<typeof agentChannelWebhookDtoSchema>

export const agentChannelDtoSchema = z.object({
  id: z.uuid(),
  agentId: z.uuid(),
  type: z.enum(AGENT_CHANNEL_TYPES),
  status: z.enum(AGENT_CHANNEL_STATUSES),
  config: agentChannelConfigSchema,
  /**
   * First characters of the widget token; the token itself is shown once, when it is created or
   * rotated. Null on an active widget channel approved after a Builder's request: its token is
   * not issued yet, and anyone who can edit the agent may issue it once (`rotate-token`).
   */
  publicTokenPrefix: z.string().nullable(),
  /** Slack workspace and bot, or the WhatsApp phone number the channel is routed by. */
  externalAccountId: z.string().nullable(),
  /** Slack and WhatsApp credentials. */
  connection: z
    .object({
      id: z.uuid(),
      name: z.string(),
      status: z.enum(['active', 'expired', 'revoked', 'error']),
    })
    .nullable(),
  /** The `channel_publish` request while `pending_approval`. */
  approvalId: z.uuid().nullable(),
  requestedBy: userRefDtoSchema.nullable(),
  approvedBy: userRefDtoSchema.nullable(),
  /** An API error code shown on the row with Reconnect. */
  lastErrorCode: z.string().nullable(),
  webhook: agentChannelWebhookDtoSchema.nullable(),
  lastActiveAt: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
})
export type AgentChannelDto = z.infer<typeof agentChannelDtoSchema>

export const agentChannelParamsSchema = agentParamsSchema.extend({ channelId: z.uuid() })
export type AgentChannelParams = z.infer<typeof agentChannelParamsSchema>

export const agentChannelListDtoSchema = z.object({ items: z.array(agentChannelDtoSchema) })
export type AgentChannelListDto = z.infer<typeof agentChannelListDtoSchema>

/** A channel to enable: shared by `POST …/channels` and the publish request. */
export const agentChannelRequestSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('api'), config: apiChannelConfigSchema.optional() }),
  z.object({ type: z.literal('widget'), config: widgetChannelConfigSchema }),
  z.object({ type: z.literal('slack'), connectionId: z.uuid(), config: slackChannelConfigSchema }),
  z.object({
    type: z.literal('whatsapp'),
    connectionId: z.uuid(),
    config: whatsappChannelConfigSchema,
  }),
])
export type AgentChannelRequest = z.infer<typeof agentChannelRequestSchema>

/** `POST …/channels`: the answer carries the widget token once. */
export const createAgentChannelInputSchema = agentChannelRequestSchema
export type CreateAgentChannelInput = z.infer<typeof createAgentChannelInputSchema>

/** The widget token is the only secret a channel shows, and only here: "You won't be able to see this again". */
export const agentChannelCreatedDtoSchema = z.object({
  channel: agentChannelDtoSchema,
  token: z.string().min(1).nullable(),
})
export type AgentChannelCreatedDto = z.infer<typeof agentChannelCreatedDtoSchema>

/** `PATCH …/:channelId`: the block of the channel's own type (a mismatch is a validation error). */
export const updateAgentChannelInputSchema = z
  .object({
    widget: widgetChannelConfigSchema,
    api: apiChannelConfigSchema,
    slack: slackChannelConfigSchema,
    whatsapp: whatsappChannelConfigSchema,
    connectionId: z.uuid(),
  })
  .partial()
  .refine((input) => Object.keys(input).length > 0)
export type UpdateAgentChannelInput = z.infer<typeof updateAgentChannelInputSchema>
