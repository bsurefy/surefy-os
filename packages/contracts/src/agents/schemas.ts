// SPDX-License-Identifier: AGPL-3.0-only
import { z } from 'zod'

import { agentAudienceSummaryDtoSchema, agentParamsSchema } from './access.js'
import { agentChannelDtoSchema } from './channels.js'
import { agentDefinitionSchema } from './definition.js'
import { agentTemplateKeySchema } from './templates.js'
import { userRefDtoSchema } from '../auth/schemas.js'
import { multiValueQuery, searchQuery } from '../core/filters.js'
import { pageQuery, sortQuery } from '../core/pagination.js'
import { modelRefDtoSchema } from '../models/gateway.js'

// Agents: the agent itself, its editable draft and its lifecycle (database/agents-and-runs.md §1;
// Agents › list and editor). Routes, under /api/v1/orgs/:orgId/agents:
// GET / · POST / · GET /usable · GET /templates (templates.ts) ·
// GET/PATCH/DELETE /:agentId · GET/PUT /:agentId/draft · GET /:agentId/impact ·
// POST /:agentId/{duplicate,pause,resume,archive,restore}.
// Versions and publishing are in versions.ts, the audience in access.ts, channels in channels.ts.
// Runs on channels use the live version; test runs use the draft.

export const AGENT_STATUSES = ['draft', 'active', 'paused', 'archived'] as const
export type AgentStatus = (typeof AGENT_STATUSES)[number]

export const agentNameSchema = z.string().trim().min(1).max(120)
export const agentDescriptionSchema = z.string().trim().max(1000)

/** Shown only with at least this many finished runs in the window; below it: "Not enough runs yet". */
export const AGENT_TRUST_MIN_RUNS = 20
export const AGENT_TRUST_WINDOW_DAYS = 30
/** Last runs that must all fail for "Needs attention". */
export const AGENT_FAILED_RUNS_ATTENTION = 5

/** Statuses of a run as the card shows its last one (the run contract owns the full lifecycle). */
export const AGENT_LAST_RUN_STATUSES = [
  'queued',
  'running',
  'waiting_approval',
  'succeeded',
  'failed',
  'canceled',
  'timed_out',
] as const

/** Why an agent is under "Needs attention"; computed per agent, never stored. */
export const AGENT_ATTENTION_REASONS = [
  'connection_failed',
  'model_not_allowed',
  'recent_runs_failed',
] as const
export type AgentAttentionReason = (typeof AGENT_ATTENTION_REASONS)[number]

/**
 * Share of finished, non-test runs in the last 30 days that succeeded without human correction.
 * `score` (0 to 1) is null below `AGENT_TRUST_MIN_RUNS`.
 */
export const agentTrustDtoSchema = z.object({
  score: z.number().min(0).max(1).nullable(),
  runs: z.number().int().nonnegative(),
})
export type AgentTrustDto = z.infer<typeof agentTrustDtoSchema>

/** An agent on the list: a card or a table row. */
export const agentDtoSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  description: z.string().nullable(),
  status: z.enum(AGENT_STATUSES),
  owner: userRefDtoSchema.nullable(),
  /** The live version's model, or the draft's before the first publish. */
  model: modelRefDtoSchema.nullable(),
  /** Null until the first publish. */
  liveVersion: z.number().int().positive().nullable(),
  hasUnpublishedChanges: z.boolean(),
  templateKey: agentTemplateKeySchema.nullable(),
  sharedWith: agentAudienceSummaryDtoSchema,
  lastRun: z.object({ status: z.enum(AGENT_LAST_RUN_STATUSES), at: z.iso.datetime() }).nullable(),
  runsThisWeek: z.number().int().nonnegative(),
  approvalsWaiting: z.number().int().nonnegative(),
  trust: agentTrustDtoSchema,
  needsAttention: z.array(z.enum(AGENT_ATTENTION_REASONS)),
  /** The person may edit, test, publish, pause and archive it. */
  canEdit: z.boolean(),
  canDelete: z.boolean(),
  pausedAt: z.iso.datetime().nullable(),
  archivedAt: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
})
export type AgentDto = z.infer<typeof agentDtoSchema>

/** `draftRevision` is the base of the next save; bumped by every draft save and every publish. */
export const agentDraftDtoSchema = z.object({
  definition: agentDefinitionSchema,
  revision: z.number().int().positive(),
  updatedAt: z.iso.datetime(),
  updatedBy: userRefDtoSchema.nullable(),
})
export type AgentDraftDto = z.infer<typeof agentDraftDtoSchema>

/** `GET …/:agentId`: the editor's header and tabs. */
export const agentDetailDtoSchema = agentDtoSchema.extend({
  draft: agentDraftDtoSchema,
  channels: z.array(agentChannelDtoSchema),
})
export type AgentDetailDto = z.infer<typeof agentDetailDtoSchema>

export const AGENT_SORT_FIELDS = ['lastRunAt', 'name', 'runsThisWeek'] as const

/**
 * `GET …/agents`. Archived agents are listed only when `status=archived` is asked for;
 * `needsAttention` is the "Needs attention" filter, `mine` the owner filter's "me".
 */
export const listAgentsQuerySchema = pageQuery.extend({
  q: searchQuery,
  status: multiValueQuery(z.enum(AGENT_STATUSES)),
  needsAttention: z.stringbool().optional(),
  ownerId: z.uuid().optional(),
  mine: z.stringbool().optional(),
  sort: sortQuery(AGENT_SORT_FIELDS),
})
export type ListAgentsQuery = z.infer<typeof listAgentsQuerySchema>

/** An agent the person may talk to, as the Chat picker lists it ("Agents shared with you"). */
export const usableAgentDtoSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  description: z.string().nullable(),
  conversationStarters: z.array(z.string()),
  model: modelRefDtoSchema.nullable(),
})
export type UsableAgentDto = z.infer<typeof usableAgentDtoSchema>

export const listUsableAgentsQuerySchema = pageQuery.extend({ q: searchQuery })
export type ListUsableAgentsQuery = z.infer<typeof listUsableAgentsQuerySchema>

// ── Create, edit, duplicate ─────────────────────────────────────────────────────────────────────

/**
 * `POST …/agents`: from a template, or from scratch without `templateKey`. `modelKey` defaults to
 * the template's suggestion or an allowed model. Counts toward `maxAgents` (LIMIT_REACHED).
 */
export const createAgentInputSchema = z.object({
  name: agentNameSchema,
  description: agentDescriptionSchema.optional(),
  templateKey: agentTemplateKeySchema.optional(),
  modelKey: z.string().min(1).max(300).optional(),
})
export type CreateAgentInput = z.infer<typeof createAgentInputSchema>

/** `PATCH …/:agentId`: live metadata, saved directly and not versioned. */
export const updateAgentInputSchema = z
  .object({ name: agentNameSchema, description: agentDescriptionSchema.nullable() })
  .partial()
  .refine((input) => Object.keys(input).length > 0)
export type UpdateAgentInput = z.infer<typeof updateAgentInputSchema>

/** `POST …/:agentId/duplicate`: a draft copy owned by the caller, with no channels and no audience. */
export const duplicateAgentInputSchema = z.object({ name: agentNameSchema.optional() })
export type DuplicateAgentInput = z.infer<typeof duplicateAgentInputSchema>

/**
 * `PUT …/:agentId/draft`: autosave. `baseRevision` is the revision the client last saw; if the
 * draft moved, the answer is `409 AGENT_EDIT_CONFLICT` and nothing is saved.
 */
export const saveAgentDraftInputSchema = z.object({
  baseRevision: z.number().int().positive(),
  definition: agentDefinitionSchema,
})
export type SaveAgentDraftInput = z.infer<typeof saveAgentDraftInputSchema>

export const saveAgentDraftDtoSchema = z.object({
  revision: z.number().int().positive(),
  updatedAt: z.iso.datetime(),
  hasUnpublishedChanges: z.boolean(),
})
export type SaveAgentDraftDto = z.infer<typeof saveAgentDraftDtoSchema>

/**
 * `details` of `AGENT_EDIT_CONFLICT`: "Maya published v5 while you were editing · Review changes ·
 * Keep mine". **Keep mine** resends the draft with `currentRevision` as the new base.
 */
export const agentEditConflictDetailsSchema = z.object({
  currentRevision: z.number().int().positive(),
  updatedAt: z.iso.datetime(),
  updatedBy: userRefDtoSchema.nullable(),
  /** Set when the last change was a publish. */
  publishedVersion: z.number().int().positive().nullable(),
})
export type AgentEditConflictDetails = z.infer<typeof agentEditConflictDetailsSchema>

// ── Lifecycle ───────────────────────────────────────────────────────────────────────────────────

/**
 * `draft ──first publish──► active ⇄ paused`; any → `archived`; `archived ──restore──► paused`
 * (ever published) or `draft` (never published). `draft → active` happens only in a publish.
 */
export const AGENT_LIFECYCLE_ACTIONS = ['pause', 'resume', 'archive', 'restore', 'delete'] as const
export type AgentLifecycleAction = (typeof AGENT_LIFECYCLE_ACTIONS)[number]

export const agentLifecycleParamsSchema = agentParamsSchema
export type AgentLifecycleParams = z.infer<typeof agentLifecycleParamsSchema>

export const agentImpactQuerySchema = z.object({
  action: z.enum(['pause', 'archive', 'delete']),
})
export type AgentImpactQuery = z.infer<typeof agentImpactQuerySchema>

/** What the T2 and T3 dialogs say: "Shared with 3 teams · live channels stop answering", "Its 4,812 runs stay in the audit log". */
export const agentImpactDtoSchema = z.object({
  sharedWith: agentAudienceSummaryDtoSchema,
  activeChannels: z.array(z.object({ id: z.uuid(), type: agentChannelDtoSchema.shape.type })),
  runCount: z.number().int().nonnegative(),
  pendingApprovals: z.number().int().nonnegative(),
  /** A published agent or one with runs becomes a tombstone: T3, type the name. */
  deleteRequiresConfirmation: z.boolean(),
})
export type AgentImpactDto = z.infer<typeof agentImpactDtoSchema>

/**
 * `DELETE …/:agentId?confirmName=&reason=`. A never-published agent is deleted outright (T1 with
 * Undo); a published one or one with runs needs its typed name and a reason (T3).
 */
export const deleteAgentQuerySchema = z.object({
  confirmName: z.string().min(1).max(120).optional(),
  reason: z.string().trim().min(1).max(1000).optional(),
})
export type DeleteAgentQuery = z.infer<typeof deleteAgentQuerySchema>
