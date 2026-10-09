// SPDX-License-Identifier: AGPL-3.0-only
import { z } from 'zod'

import { agentDefinitionSchema } from '../agents/definition.js'
import { DATA_LOCATIONS } from '../chat/schemas.js'
import { orgParamsSchema } from '../core/params.js'
import { guardCheckResultSchema, GUARD_OUTCOMES } from '../guard/decision.js'
import { modelKeySchema } from '../models/keys.js'

// The step trace of a run (database/agents-and-runs.md §6; backend/agent-runs.md §2; Insights › Run
// detail, Agents › Editor › Test). Routes, under /api/v1/orgs/:orgId/runs/:runId:
// GET /steps · GET /steps/:seq.
// Steps are append-only. The list answers without input and output, so the waterfall stays small;
// one step answers with its data. Step data older than 90 days is gone: `stepsExpired` says so.

export const AGENT_RUN_STEP_TYPES = [
  'retrieval',
  'model',
  'tool',
  'decision',
  'approval',
  'guard',
  'web_search',
] as const
export type AgentRunStepType = (typeof AGENT_RUN_STEP_TYPES)[number]

/** `waiting` is an approval that nobody resolved yet; `blocked` is a tool call Guard refused. */
export const AGENT_RUN_STEP_STATUSES = [
  'succeeded',
  'failed',
  'skipped',
  'waiting',
  'blocked',
] as const
export type AgentRunStepStatus = (typeof AGENT_RUN_STEP_STATUSES)[number]

// ── Step data (`AgentRunStepData` v1) ───────────────────────────────────────────────────────────

export const AGENT_RUN_MESSAGE_ROLES = ['user', 'assistant'] as const

export const agentRunMessageSchema = z.object({
  role: z.enum(AGENT_RUN_MESSAGE_ROLES),
  text: z.string().max(100_000),
})
export type AgentRunMessage = z.infer<typeof agentRunMessageSchema>

/** Most messages a run starts from. */
export const AGENT_RUN_INPUT_MESSAGES_MAX = 50

/**
 * What the run answers, recorded in the first step: the executor never reads the chat or the
 * channel again. Test runs add a snapshot of the draft; retried runs name the run they come from.
 */
export const agentRunInputSchema = z.object({
  messages: z.array(agentRunMessageSchema).min(1).max(AGENT_RUN_INPUT_MESSAGES_MAX),
  channelId: z.uuid().nullable(),
  /** The channel's own reference (a Slack message, a WhatsApp message id), for replies and deduplication. */
  externalRef: z.string().max(200).nullable(),
  definitionSnapshot: agentDefinitionSchema.nullable(),
  retryOf: z.object({ runId: z.uuid(), seq: z.number().int().positive().nullable() }).nullable(),
})
export type AgentRunInput = z.infer<typeof agentRunInputSchema>

const passageSchema = z.object({
  documentId: z.uuid(),
  title: z.string(),
  page: z.number().int().positive().nullable(),
  score: z.number().min(0).max(1),
  text: z.string().max(5000),
})

const dataBaseShape = { version: z.literal(1), truncated: z.boolean().default(false) } as const

/**
 * The model's id of the tool call a decision, Guard, approval or tool step belongs to. The
 * executor rebuilds a turn from these: a call is complete when its `tool` step exists.
 */
const callIdShape = { callId: z.string().max(200).optional() } as const

/** One variant per step type; `input` and `output` of a step carry the variant of its `type`. */
export const agentRunStepDataSchema = z.discriminatedUnion('kind', [
  z.object({
    ...dataBaseShape,
    kind: z.literal('retrieval'),
    query: z.string().max(2000).optional(),
    passages: z.array(passageSchema).max(50).optional(),
    run: agentRunInputSchema.optional(),
  }),
  z.object({
    ...dataBaseShape,
    kind: z.literal('model'),
    messagesSummary: z.string().max(5000).optional(),
    text: z.string().max(100_000).optional(),
    toolCalls: z
      .array(
        z.object({
          id: z.string(),
          name: z.string(),
          arguments: z.record(z.string(), z.unknown()),
        }),
      )
      .max(50)
      .optional(),
    finishReason: z.string().max(50).optional(),
    run: agentRunInputSchema.optional(),
  }),
  z.object({
    ...dataBaseShape,
    kind: z.literal('tool'),
    ...callIdShape,
    toolId: z.uuid().optional(),
    arguments: z.record(z.string(), z.unknown()).optional(),
    result: z.unknown().optional(),
    isError: z.boolean().optional(),
  }),
  z.object({
    ...dataBaseShape,
    kind: z.literal('decision'),
    ...callIdShape,
    question: z.string().max(2000).optional(),
    options: z.array(z.string()).max(20).optional(),
    value: z.union([z.string(), z.number(), z.boolean()]).optional(),
    reasoning: z.string().max(4000).optional(),
  }),
  z.object({
    ...dataBaseShape,
    kind: z.literal('approval'),
    ...callIdShape,
    ruleRef: z.string().max(300).nullable().optional(),
    outcome: z
      .enum([
        'approved',
        'approved_with_edits',
        'rejected',
        'timed_out_rejected',
        'timed_out_continued',
      ])
      .optional(),
    editedInput: z.record(z.string(), z.unknown()).optional(),
  }),
  z.object({
    ...dataBaseShape,
    kind: z.literal('guard'),
    ...callIdShape,
    action: z.string().max(200).optional(),
    result: guardCheckResultSchema.optional(),
  }),
  z.object({
    ...dataBaseShape,
    kind: z.literal('web_search'),
    provider: z.string().max(50).optional(),
    query: z.string().max(2000).optional(),
    results: z
      .array(
        z.object({ title: z.string(), url: z.string().max(2048), snippet: z.string().max(2000) }),
      )
      .max(20)
      .optional(),
  }),
])
export type AgentRunStepData = z.infer<typeof agentRunStepDataSchema>

// ── DTOs ────────────────────────────────────────────────────────────────────────────────────────

const counterSchema = z.number().int().nonnegative()

/** One row of the waterfall: time, cost and outcome, without the data. */
export const agentRunStepDtoSchema = z.object({
  id: z.uuid(),
  seq: z.number().int().positive(),
  type: z.enum(AGENT_RUN_STEP_TYPES),
  /** The tool, model or search the step shows: "Refund API", "Search HR Policies". */
  name: z.string(),
  status: z.enum(AGENT_RUN_STEP_STATUSES),
  modelKey: modelKeySchema.nullable(),
  inputTokens: counterSchema,
  outputTokens: counterSchema,
  costMicros: counterSchema,
  currency: z.string().length(3),
  /** 0 to 1: decision and Guard steps. */
  confidence: z.number().min(0).max(1).nullable(),
  guardBand: z.enum(GUARD_OUTCOMES).nullable(),
  /** The approval this step created or resolved. */
  approvalId: z.uuid().nullable(),
  dataLocation: z.enum(DATA_LOCATIONS).nullable(),
  /** An API error code: a Guard block, or a tool or model failure. */
  errorCode: z.string().nullable(),
  startedAt: z.iso.datetime(),
  finishedAt: z.iso.datetime().nullable(),
  durationMs: counterSchema.nullable(),
})
export type AgentRunStepDto = z.infer<typeof agentRunStepDtoSchema>

/** `GET …/steps/:seq`: the step with its data, capped at 64 KB each. */
export const agentRunStepDetailDtoSchema = agentRunStepDtoSchema.extend({
  input: agentRunStepDataSchema.nullable(),
  output: agentRunStepDataSchema.nullable(),
})
export type AgentRunStepDetailDto = z.infer<typeof agentRunStepDetailDtoSchema>

export const agentRunStepsDtoSchema = z.object({
  items: z.array(agentRunStepDtoSchema),
  /** The step rows passed their 90 days: "Step details are kept for 90 days". */
  stepsExpired: z.boolean(),
})
export type AgentRunStepsDto = z.infer<typeof agentRunStepsDtoSchema>

export const agentRunParamsSchema = orgParamsSchema.extend({ runId: z.uuid() })
export type AgentRunParams = z.infer<typeof agentRunParamsSchema>

export const agentRunStepParamsSchema = agentRunParamsSchema.extend({
  seq: z.coerce.number().int().positive(),
})
export type AgentRunStepParams = z.infer<typeof agentRunStepParamsSchema>
