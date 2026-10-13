// SPDX-License-Identifier: AGPL-3.0-only
import { z } from 'zod'

import { AGENT_RUN_STATUSES } from './runs.js'
import { agentRunMessageSchema } from './steps.js'
import { agentParamsSchema } from '../agents/access.js'
import { orgParamsSchema } from '../core/params.js'

// The public run endpoints of the API channel (backend/agent-runs.md §3; Agents › Publish ›
// API). They answer on the public API host to an organization API key with the `agents:invoke`
// scope; they never reach the signed-in routes. Routes, under /api/v1/orgs/:orgId:
// POST /agents/:agentId/runs · GET /runs/:runId · GET /runs/:runId/events · POST /runs/:runId/cancel.
// - A key sees only the runs it started.
// - `POST …/runs` takes an `Idempotency-Key` header: a repeat returns the run of the first call.
// - It answers `202` with the run and a `Location` header, or, with `?stream=true`, with the event
//   stream. A run that needs a person ends `waiting_approval`; poll or stream until it resumes.
// - The agent must be published, `active` and have an `active` API channel (AGENT_NOT_PUBLISHED,
//   AGENT_PAUSED otherwise); the channel's rate limit answers RATE_LIMITED.

export const PUBLIC_RUN_INPUT_TEXT_MAX_LENGTH = 100_000
export const PUBLIC_RUN_MESSAGES_MAX = 50
export const PUBLIC_RUN_METADATA_MAX_ENTRIES = 20

/** Either one message, or the whole conversation so far (the last message is the user's). */
export const publicRunInputSchema = z
  .object({
    input: z.string().trim().min(1).max(PUBLIC_RUN_INPUT_TEXT_MAX_LENGTH).optional(),
    messages: z.array(agentRunMessageSchema).min(1).max(PUBLIC_RUN_MESSAGES_MAX).optional(),
    /** Echoed back on the run; the caller's own references. Never sent to the model. */
    metadata: z
      .record(z.string().min(1).max(50), z.string().max(500))
      .refine((metadata) => Object.keys(metadata).length <= PUBLIC_RUN_METADATA_MAX_ENTRIES)
      .optional(),
  })
  .refine((body) => (body.input === undefined) !== (body.messages === undefined))
  .refine((body) => body.messages === undefined || body.messages.at(-1)?.role === 'user')
export type PublicRunInput = z.infer<typeof publicRunInputSchema>

export const publicRunParamsSchema = agentParamsSchema
export type PublicRunParams = z.infer<typeof publicRunParamsSchema>

export const publicRunReadParamsSchema = orgParamsSchema.extend({ runId: z.uuid() })
export type PublicRunReadParams = z.infer<typeof publicRunReadParamsSchema>

export const publicRunSourceSchema = z.object({
  title: z.string(),
  documentId: z.uuid().nullable(),
  page: z.number().int().positive().nullable(),
})

/** The answer of a finished run: the final text and what it cited. */
export const publicRunOutputSchema = z.object({
  text: z.string(),
  sources: z.array(publicRunSourceSchema).max(50),
})
export type PublicRunOutput = z.infer<typeof publicRunOutputSchema>

/** A run as an API caller sees it: no steps, no internals. */
export const publicRunDtoSchema = z.object({
  id: z.uuid(),
  agentId: z.uuid(),
  status: z.enum(AGENT_RUN_STATUSES),
  /** Set when the run is `succeeded`; null while it runs and for steps past their retention. */
  output: publicRunOutputSchema.nullable(),
  /** An API error code on `failed` and `timed_out`. */
  errorCode: z.string().nullable(),
  /** The run waits for a person to approve an action. */
  waitingForApproval: z.boolean(),
  metadata: z.record(z.string(), z.string()),
  inputTokens: z.number().int().nonnegative(),
  outputTokens: z.number().int().nonnegative(),
  createdAt: z.iso.datetime(),
  finishedAt: z.iso.datetime().nullable(),
})
export type PublicRunDto = z.infer<typeof publicRunDtoSchema>
