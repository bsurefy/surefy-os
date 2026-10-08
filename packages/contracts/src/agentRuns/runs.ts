// SPDX-License-Identifier: AGPL-3.0-only
import { z } from 'zod'

import { agentRunInputSchema } from './steps.js'
import { AGENT_CHANNEL_TYPES } from '../agents/channels.js'
import { userRefDtoSchema } from '../auth/schemas.js'
import { DATA_LOCATIONS } from '../chat/schemas.js'
import { multiValueQuery, searchQuery } from '../core/filters.js'
import { pageQuery, sortQuery } from '../core/pagination.js'
import { GUARD_OUTCOMES } from '../guard/decision.js'
import { modelRefDtoSchema } from '../models/gateway.js'

// Runs (database/agents-and-runs.md §5; backend/agent-runs.md §2–§3, §7; Insights › Runs and run
// detail, Agents › Editor › Test and Runs). Routes, under /api/v1/orgs/:orgId:
// GET /runs · GET /agents/:agentId/runs (the same list, one agent) · GET /runs/:runId ·
// POST /runs/:runId/{cancel,retry} · POST /agents/:agentId/test-runs (draft, signed in) ·
// POST /agents/:agentId/runs (live version, API key: public.ts).
// A run executes in the worker; these routes only start, read and steer it.

export const AGENT_RUN_STATUSES = [
  'queued',
  'running',
  'waiting_approval',
  'succeeded',
  'failed',
  'canceled',
  'timed_out',
] as const
export type AgentRunStatus = (typeof AGENT_RUN_STATUSES)[number]

/** `queued → running ⇄ waiting_approval`; `running → succeeded | failed | timed_out`; cancel from any open status. */
export const AGENT_RUN_ACTIVE_STATUSES = ['queued', 'running', 'waiting_approval'] as const
export const AGENT_RUN_TERMINAL_STATUSES = ['succeeded', 'failed', 'canceled', 'timed_out'] as const

export const AGENT_RUN_TRIGGERS = [
  'chat',
  'test',
  'api',
  'widget',
  'slack',
  'whatsapp',
  'flow',
] as const
export type AgentRunTrigger = (typeof AGENT_RUN_TRIGGERS)[number]

/** Triggers that need no signed-in person: `startedBy` is null. */
export const AGENT_RUN_ANONYMOUS_TRIGGERS = ['api', 'widget', 'slack', 'whatsapp', 'flow'] as const

/** `AgentRunSummary` v1, written when the run ends. It never holds prompts or tool results. */
export const agentRunSummarySchema = z.object({
  version: z.literal(1),
  /** One sentence for the run detail header. */
  outcome: z.string().max(500),
  toolsUsed: z.array(z.string()).max(50),
  sourcesCount: z.number().int().nonnegative(),
  /** Guard checks per outcome. */
  guardChecks: z.partialRecord(z.enum(GUARD_OUTCOMES), z.number().int().nonnegative()),
  approvalIds: z.array(z.uuid()).max(100),
  dataLocations: z.array(z.enum(DATA_LOCATIONS)),
})
export type AgentRunSummary = z.infer<typeof agentRunSummarySchema>

const counterSchema = z.number().int().nonnegative()

/** A run as the Insights table and an agent's Runs tab show it. */
export const agentRunDtoSchema = z.object({
  /** Shown as the run ID. */
  id: z.uuid(),
  /** Null for an agent that was purged; a tombstone keeps `isAgentDeleted`. */
  agent: z.object({ id: z.uuid(), name: z.string() }).nullable(),
  isAgentDeleted: z.boolean(),
  /** The version that ran; null for test runs of the draft. */
  agentVersion: z.number().int().positive().nullable(),
  trigger: z.enum(AGENT_RUN_TRIGGERS),
  isTest: z.boolean(),
  status: z.enum(AGENT_RUN_STATUSES),
  startedBy: userRefDtoSchema.nullable(),
  channel: z.object({ id: z.uuid(), type: z.enum(AGENT_CHANNEL_TYPES) }).nullable(),
  /** Main model, after routing and fallback. */
  model: modelRefDtoSchema.nullable(),
  inputTokens: counterSchema,
  outputTokens: counterSchema,
  costMicros: counterSchema,
  currency: z.string().length(3),
  /** Lowest decision confidence (0 to 1) in the run. */
  minConfidence: z.number().min(0).max(1).nullable(),
  neededHuman: z.boolean(),
  /** An approver edited or rejected an action, or a person corrected the answer. */
  humanCorrected: z.boolean(),
  stepCount: counterSchema,
  /** An API error code on `failed` and `timed_out`. */
  errorCode: z.string().nullable(),
  startedAt: z.iso.datetime().nullable(),
  finishedAt: z.iso.datetime().nullable(),
  /** Waiting time included. */
  durationMs: counterSchema.nullable(),
  createdAt: z.iso.datetime(),
})
export type AgentRunDto = z.infer<typeof agentRunDtoSchema>

/** `GET …/runs/:runId`: the header, facts and side panel of run detail. */
export const agentRunDetailDtoSchema = agentRunDtoSchema.extend({
  summary: agentRunSummarySchema.nullable(),
  /** The run this one retries. */
  retryOf: z.object({ runId: z.uuid(), seq: z.number().int().positive().nullable() }).nullable(),
  dataLocations: z.array(z.enum(DATA_LOCATIONS)),
  /** Approvals the run waits for now. */
  pendingApprovalIds: z.array(z.uuid()),
  /** The person may cancel it (an open run of an agent they can edit), retry it (a finished one). */
  canCancel: z.boolean(),
  canRetry: z.boolean(),
})
export type AgentRunDetailDto = z.infer<typeof agentRunDetailDtoSchema>

export const AGENT_RUN_SORT_FIELDS = ['startedAt', 'durationMs', 'costMicros'] as const

/**
 * `GET …/runs`. Test runs are left out unless `isTest` asks for them. `q` matches the run id,
 * the agent name and the person.
 */
export const listAgentRunsQuerySchema = pageQuery.extend({
  q: searchQuery,
  agentId: z.uuid().optional(),
  status: multiValueQuery(z.enum(AGENT_RUN_STATUSES)),
  trigger: multiValueQuery(z.enum(AGENT_RUN_TRIGGERS)),
  startedByUserId: z.uuid().optional(),
  teamId: z.uuid().optional(),
  modelKey: z.string().min(1).max(300).optional(),
  isTest: z.stringbool().optional(),
  /** Runs that needed or got a person. */
  neededHuman: z.stringbool().optional(),
  from: z.iso.datetime().optional(),
  to: z.iso.datetime().optional(),
  sort: sortQuery(AGENT_RUN_SORT_FIELDS),
})
export type ListAgentRunsQuery = z.infer<typeof listAgentRunsQuerySchema>

// ── Start, cancel, retry ────────────────────────────────────────────────────────────────────────

/**
 * `POST …/agents/:agentId/test-runs`: a run of the draft in the editor's sandbox. The answer is
 * the queued run; the client opens the event stream.
 */
export const startTestRunInputSchema = z.object({
  messages: agentRunInputSchema.shape.messages,
})
export type StartTestRunInput = z.infer<typeof startTestRunInputSchema>

/**
 * `POST …/runs/:runId/retry`: a new run with the same input. `fromFailedStep` (test runs only,
 * "Retry step") reuses the earlier steps and runs the failed tool call again; it needs a failed
 * tool step (AGENT_RUN_NOT_RETRYABLE otherwise).
 */
export const retryAgentRunInputSchema = z.object({
  fromFailedStep: z.boolean().default(false),
})
export type RetryAgentRunInput = z.infer<typeof retryAgentRunInputSchema>
