// SPDX-License-Identifier: AGPL-3.0-only
import { z } from 'zod'

import { AGENT_RUN_STATUSES } from './runs.js'
import { agentRunParamsSchema, agentRunStepDtoSchema } from './steps.js'
import { approvalAssigneeDtoSchema } from '../approvals/schemas.js'
import { chatUsageSchema } from '../chat/schemas.js'
import { guardCheckResultSchema } from '../guard/decision.js'

// The run event stream (backend/agent-runs.md §8). Route, under /api/v1/orgs/:orgId:
// GET /runs/:runId/events, also the response of a started run when the caller asks to stream
// (`POST …/test-runs?stream=true`, `POST …/agents/:agentId/runs?stream=true`, and the chat
// message route for an agent chat).
//
// `200 text/event-stream` in the AI SDK UI message stream format: the SDK's own chunks (`start`,
// `text-*`, `reasoning-*`, `tool-input-available`, `tool-output-available`, `source-url`,
// `finish`, `error`) plus the SurefyOS data chunks below, sent as `data-<name>` with the schema
// named here. Rules:
// - Event ids are the ids of the run's Redis stream. A client reconnects with the `Last-Event-ID`
//   header (or `?after=`) and receives what it missed, in order, without duplicates.
// - When the stream's events expired or were trimmed, the server rebuilds them from the stored
//   steps: one `data-step` per step, the final text without deltas. Then it attaches to the tail.
// - Closing the stream never cancels the run.
// - A run that waits for an approval keeps the stream open for AGENT_RUN_WAITING_STREAM_MINUTES,
//   then ends it after a final `data-run`; clients reconnect.
// - An `error` chunk after the first byte has an API error code as `errorText`.
// Chat runs also send the chat stream's `data-message`, `data-model` and `data-title` chunks.

export const AGENT_RUN_DATA_PART_DATA_TYPES = {
  /** The run's status changed. */
  run: 'data-run',
  /** A step was stored. */
  step: 'data-step',
  /** A Guard check finished. */
  guard: 'data-guard',
  /** An approval was created and the run waits for it. */
  approvalRequired: 'data-approval-required',
  /** After each model call. */
  usage: 'data-usage',
  /** After each decision. */
  confidence: 'data-confidence',
} as const

export const agentRunStatusDataSchema = z.object({
  runId: z.uuid(),
  status: z.enum(AGENT_RUN_STATUSES),
  /** An API error code on `failed` and `timed_out`. */
  errorCode: z.string().nullable(),
})
export type AgentRunStatusData = z.infer<typeof agentRunStatusDataSchema>

/** The step as the waterfall draws it, sent when it is stored. */
export const agentRunStepEventSchema = agentRunStepDtoSchema
export type AgentRunStepEvent = z.infer<typeof agentRunStepEventSchema>

export const agentRunGuardDataSchema = z.object({
  seq: z.number().int().positive(),
  /** The tool the check was for. */
  action: z.string(),
  result: guardCheckResultSchema,
})
export type AgentRunGuardData = z.infer<typeof agentRunGuardDataSchema>

/** "Waiting for approval by Finance · usually under 1 hour". */
export const agentRunApprovalDataSchema = z.object({
  seq: z.number().int().positive(),
  approvalId: z.uuid(),
  title: z.string(),
  assignees: z.array(approvalAssigneeDtoSchema),
  expiresAt: z.iso.datetime().nullable(),
})
export type AgentRunApprovalData = z.infer<typeof agentRunApprovalDataSchema>

export const agentRunUsageDataSchema = chatUsageSchema.extend({ seq: z.number().int().positive() })
export type AgentRunUsageData = z.infer<typeof agentRunUsageDataSchema>

export const agentRunConfidenceDataSchema = z.object({
  seq: z.number().int().positive(),
  /** 0 to 1. */
  value: z.number().min(0).max(1),
  question: z.string().max(2000),
})
export type AgentRunConfidenceData = z.infer<typeof agentRunConfidenceDataSchema>

/** One schema per SurefyOS data chunk of a run, keyed by its name (`data-<name>` on the wire). */
export const agentRunStreamDataSchemas = {
  run: agentRunStatusDataSchema,
  step: agentRunStepEventSchema,
  guard: agentRunGuardDataSchema,
  approvalRequired: agentRunApprovalDataSchema,
  usage: agentRunUsageDataSchema,
  confidence: agentRunConfidenceDataSchema,
} as const

export const agentRunEventsParamsSchema = agentRunParamsSchema
export type AgentRunEventsParams = z.infer<typeof agentRunEventsParamsSchema>

/** `GET …/runs/:runId/events?after=`: the same as the `Last-Event-ID` header, for clients that cannot set one. */
export const agentRunEventsQuerySchema = z.object({ after: z.string().min(1).max(100).optional() })
export type AgentRunEventsQuery = z.infer<typeof agentRunEventsQuerySchema>

/** `?stream=true` on a start route: answer with the event stream instead of the queued run. */
export const agentRunStreamQuerySchema = z.object({ stream: z.stringbool().default(false) })
export type AgentRunStreamQuery = z.infer<typeof agentRunStreamQuerySchema>
