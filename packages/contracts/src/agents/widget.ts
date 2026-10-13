// SPDX-License-Identifier: AGPL-3.0-only
import { z } from 'zod'

import { WIDGET_POSITIONS, WIDGET_THEMES } from './channels.js'
import { AGENT_CONVERSATION_STARTERS_MAX } from './definition.js'
import { AGENT_RUN_STATUSES } from '../agentRuns/runs.js'

// The public widget endpoint: what `@surefy/widget` calls from a website (database/
// agents-and-runs.md §4; design/workspace/website-widget.md). Routes, on the public API host and
// outside every organization path:
// GET /api/v1/widget/config · POST /api/v1/widget/messages ·
// GET /api/v1/widget/runs/:runId/events.
// - Every request carries the channel's token in `WIDGET_TOKEN_HEADER`; it resolves the
//   organization, the agent and the channel (`agent_channel_resolve_token`). Session cookies are
//   never read. An unknown, rotated or disconnected token answers `401 AGENT_WIDGET_TOKEN_INVALID`.
// - CORS answers only the channel's `allowedOrigins`; a request from another `Origin` answers
//   `403 AGENT_WIDGET_ORIGIN_NOT_ALLOWED`.
// - The channel must be `active` and the agent published and `active` (`AGENT_PAUSED`,
//   `AGENT_NOT_PUBLISHED` otherwise). Messages are limited per channel and per visitor
//   (`RATE_LIMITED` with `Retry-After`).
// - The server keeps no conversation: the widget sends the conversation so far with each message
//   and keeps it in the visitor's browser. `conversationId` is a random id the widget makes; it
//   ties a run to the visitor for the event stream and is never shown.
// - The widget bundles these types only, never this module's code (ADR 0022: the widget is MIT).

/**
 * Where the API serves the widget script (`dist/widget.js` of `@surefy/widget`), on the public
 * host: `<script src="https://api.example.com/widget/v1/widget.js" data-token="wt_…" async>`. The
 * major version is in the path; a breaking change to this endpoint ships as `/widget/v2/`.
 */
export const WIDGET_SCRIPT_PATH = '/widget/v1/widget.js'

/** The request header that carries the widget token. */
export const WIDGET_TOKEN_HEADER = 'x-surefy-widget-token'
/** The request header that carries the conversation id when the widget reattaches to a run. */
export const WIDGET_CONVERSATION_HEADER = 'x-surefy-widget-conversation'

/** `wt_` plus 43 base62 characters; shown once, when the channel is created or its token rotated. */
export const WIDGET_TOKEN_PREFIX = 'wt_'
export const WIDGET_TOKEN_PATTERN = /^wt_[0-9A-Za-z]{43}$/
/** `publicTokenPrefix`: `wt_` and the first 8 characters, shown in the Publish tab. */
export const WIDGET_TOKEN_DISPLAY_PREFIX_LENGTH = WIDGET_TOKEN_PREFIX.length + 8

/** Most messages one request carries: older ones are dropped by the widget, oldest first. */
export const WIDGET_MESSAGES_MAX = 20
export const WIDGET_MESSAGE_MAX_LENGTH = 4000

export const widgetTokenSchema = z.string().regex(WIDGET_TOKEN_PATTERN)

// ── Config ──────────────────────────────────────────────────────────────────────────────────────

/** `GET /api/v1/widget/config`: what the launcher and the empty panel show. */
export const widgetConfigDtoSchema = z.object({
  /** The agent's name, the panel title. */
  agentName: z.string(),
  /** "Hi! Ask me about orders and refunds." Empty: the panel shows the default greeting. */
  greeting: z.string(),
  conversationStarters: z.array(z.string()).max(AGENT_CONVERSATION_STARTERS_MAX),
  theme: z.enum(WIDGET_THEMES),
  position: z.enum(WIDGET_POSITIONS),
  /** The organization's locale, for the widget's own labels (`en` and the shipped locales). */
  locale: z.string().min(2).max(35),
  messageMaxLength: z.number().int().positive(),
})
export type WidgetConfigDto = z.infer<typeof widgetConfigDtoSchema>

// ── Messages ────────────────────────────────────────────────────────────────────────────────────

export const WIDGET_MESSAGE_ROLES = ['user', 'assistant'] as const
export type WidgetMessageRole = (typeof WIDGET_MESSAGE_ROLES)[number]

export const widgetMessageSchema = z.object({
  role: z.enum(WIDGET_MESSAGE_ROLES),
  text: z.string().trim().min(1).max(WIDGET_MESSAGE_MAX_LENGTH),
})
export type WidgetMessage = z.infer<typeof widgetMessageSchema>

/**
 * `POST /api/v1/widget/messages`: the conversation so far, the visitor's message last. Answers
 * `200 text/event-stream` with the events below; errors before the first byte use the normal
 * error envelope.
 */
export const sendWidgetMessageInputSchema = z.object({
  conversationId: z.uuid(),
  messages: z
    .array(widgetMessageSchema)
    .min(1)
    .max(WIDGET_MESSAGES_MAX)
    .refine((messages) => messages.at(-1)?.role === 'user', {
      message: 'The last message is the visitor’s',
    }),
})
export type SendWidgetMessageInput = z.infer<typeof sendWidgetMessageInputSchema>

export const widgetRunParamsSchema = z.object({ runId: z.uuid() })
export type WidgetRunParams = z.infer<typeof widgetRunParamsSchema>

// ── The event stream ────────────────────────────────────────────────────────────────────────────

/**
 * Server-sent events, each `event: <name>` with a JSON `data:` line and an `id:`. The stream is
 * deliberately smaller than the run event stream: no steps, no tool calls, no Guard details.
 * - `run` first, then `text-delta`s, `source`s as they are cited, and `done` last.
 * - `waiting-approval` when an action needs a person; the stream stays open for
 *   AGENT_RUN_WAITING_STREAM_MINUTES, then ends without `done`. The widget reattaches with
 *   `GET …/runs/:runId/events`, the token, `WIDGET_CONVERSATION_HEADER` and `Last-Event-ID`.
 * - `error` carries an API error code after the first byte (the stream then ends).
 * - Closing the stream never cancels the run.
 */
export const WIDGET_STREAM_EVENTS = [
  'run',
  'text-delta',
  'source',
  'waiting-approval',
  'done',
  'error',
] as const
export type WidgetStreamEventName = (typeof WIDGET_STREAM_EVENTS)[number]

export const widgetRunEventSchema = z.object({ runId: z.uuid() })
export const widgetTextDeltaEventSchema = z.object({ delta: z.string() })

/**
 * A cited source. Visitors are anonymous, so a knowledge source shows only its title (and page);
 * a web source also links to its address.
 */
export const widgetSourceEventSchema = z.object({
  index: z.number().int().min(1),
  title: z.string(),
  page: z.number().int().min(1).nullable(),
  url: z.url().nullable(),
})
export type WidgetSourceEvent = z.infer<typeof widgetSourceEventSchema>

export const widgetWaitingApprovalEventSchema = z.object({})

export const widgetDoneEventSchema = z.object({
  status: z.enum(AGENT_RUN_STATUSES),
  /** An API error code on `failed` and `timed_out`. */
  errorCode: z.string().nullable(),
})
export type WidgetDoneEvent = z.infer<typeof widgetDoneEventSchema>

export const widgetErrorEventSchema = z.object({ code: z.string().min(1) })

/** One schema per event name. */
export const widgetStreamEventSchemas = {
  run: widgetRunEventSchema,
  'text-delta': widgetTextDeltaEventSchema,
  source: widgetSourceEventSchema,
  'waiting-approval': widgetWaitingApprovalEventSchema,
  done: widgetDoneEventSchema,
  error: widgetErrorEventSchema,
} as const satisfies Record<WidgetStreamEventName, z.ZodType>

export type WidgetStreamEvent = {
  [Name in WidgetStreamEventName]: {
    event: Name
    id: string | null
    data: z.infer<(typeof widgetStreamEventSchemas)[Name]>
  }
}[WidgetStreamEventName]
