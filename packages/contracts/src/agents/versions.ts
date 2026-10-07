// SPDX-License-Identifier: AGPL-3.0-only
import { z } from 'zod'

import { agentAccessInputSchema, agentParamsSchema } from './access.js'
import { agentChannelDtoSchema, agentChannelRequestSchema } from './channels.js'
import { agentDefinitionChangeSchema, agentDefinitionSchema } from './definition.js'
import { agentDtoSchema } from './schemas.js'
import { userRefDtoSchema } from '../auth/schemas.js'
import { pageQuery } from '../core/pagination.js'

// Versions, readiness and publishing (database/agents-and-runs.md §2 and "Publish transaction";
// Agents › Editor › Publish and Versions). Routes, under /api/v1/orgs/:orgId/agents/:agentId:
// GET /readiness · POST /publish · GET /versions · GET /versions/:versionId ·
// GET /versions/:versionId/diff · POST /rollback.
// A version is an immutable copy of the draft. Rollback points the live version at an earlier one
// and creates no version; the draft is untouched.

export const AGENT_PUBLISH_NOTES_MAX_LENGTH = 2000

export const agentVersionDtoSchema = z.object({
  id: z.uuid(),
  /** 1, 2, 3 … per agent; shown as "v4". */
  version: z.number().int().positive(),
  notes: z.string().nullable(),
  publishedBy: userRefDtoSchema.nullable(),
  publishedAt: z.iso.datetime(),
  isLive: z.boolean(),
})
export type AgentVersionDto = z.infer<typeof agentVersionDtoSchema>

export const agentVersionDetailDtoSchema = agentVersionDtoSchema.extend({
  definition: agentDefinitionSchema,
})
export type AgentVersionDetailDto = z.infer<typeof agentVersionDetailDtoSchema>

export const agentVersionParamsSchema = agentParamsSchema.extend({ versionId: z.uuid() })
export type AgentVersionParams = z.infer<typeof agentVersionParamsSchema>

/** Versions, newest first. */
export const listAgentVersionsQuerySchema = pageQuery
export type ListAgentVersionsQuery = z.infer<typeof listAgentVersionsQuerySchema>

/** `GET …/versions/:versionId/diff?against=`: the version compared with the draft, the live version or another version. */
export const agentDiffQuerySchema = z.object({
  against: z.union([z.enum(['draft', 'live']), z.uuid()]).default('draft'),
})
export type AgentDiffQuery = z.infer<typeof agentDiffQuerySchema>

export const agentDiffDtoSchema = z.object({ changes: z.array(agentDefinitionChangeSchema) })
export type AgentDiffDto = z.infer<typeof agentDiffDtoSchema>

// ── Readiness ───────────────────────────────────────────────────────────────────────────────────

/** Blocking items disable Publish; warnings do not. Each links to the tab that fixes it. */
export const AGENT_READINESS_ITEMS = [
  'instructions_present',
  'model_allowed_for_audience',
  'tools_connected',
  'guard_not_looser',
  'tested_since_change',
  'can_act_without_approval_rule',
] as const
export type AgentReadinessItemKey = (typeof AGENT_READINESS_ITEMS)[number]

export const AGENT_READINESS_BLOCKING = [
  'instructions_present',
  'model_allowed_for_audience',
  'tools_connected',
  'guard_not_looser',
] as const

export const AGENT_EDITOR_TABS = [
  'instructions',
  'model',
  'tools',
  'knowledge',
  'guard',
  'test',
  'publish',
] as const

export const agentReadinessItemDtoSchema = z.object({
  key: z.enum(AGENT_READINESS_ITEMS),
  severity: z.enum(['blocking', 'warning']),
  passed: z.boolean(),
  /** The tab that fixes it. */
  tab: z.enum(AGENT_EDITOR_TABS),
  /** "GPT-4.1 isn't allowed for Sales": the failing parts, by name. */
  failures: z
    .array(z.object({ type: z.string(), id: z.uuid().nullable(), name: z.string() }))
    .max(50),
})
export type AgentReadinessItemDto = z.infer<typeof agentReadinessItemDtoSchema>

/** `GET …/readiness` and the `details` of `AGENT_NOT_READY`. */
export const agentReadinessDtoSchema = z.object({
  items: z.array(agentReadinessItemDtoSchema),
  /** Every blocking item passes. */
  canPublish: z.boolean(),
})
export type AgentReadinessDto = z.infer<typeof agentReadinessDtoSchema>

// ── Publish and rollback ────────────────────────────────────────────────────────────────────────

/**
 * `POST …/publish`: one transaction. `baseRevision` guards against a draft that moved. `access`
 * replaces the audience when given; `channels` lists the external channels to enable (SurefyOS
 * chat always goes live). Admins and Owners get them `active`; a Builder's become approval requests.
 */
export const publishAgentInputSchema = z.object({
  baseRevision: z.number().int().positive(),
  notes: z.string().trim().max(AGENT_PUBLISH_NOTES_MAX_LENGTH).optional(),
  access: agentAccessInputSchema.optional(),
  channels: z.array(agentChannelRequestSchema).max(8).default([]),
})
export type PublishAgentInput = z.infer<typeof publishAgentInputSchema>

export const publishAgentResultDtoSchema = z.object({
  agent: agentDtoSchema,
  version: agentVersionDtoSchema,
  channels: z.array(agentChannelDtoSchema),
  /** One-time widget token of a channel that went live; keyed by channel id. */
  widgetTokens: z.record(z.uuid(), z.string()),
})
export type PublishAgentResultDto = z.infer<typeof publishAgentResultDtoSchema>

/** `POST …/rollback` (T2): "Version 2 goes live for everyone using this agent". */
export const rollbackAgentInputSchema = z.object({ versionId: z.uuid() })
export type RollbackAgentInput = z.infer<typeof rollbackAgentInputSchema>
