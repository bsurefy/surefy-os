// SPDX-License-Identifier: AGPL-3.0-only
import { z } from 'zod'

import { APPROVALS_ERROR_CODES } from './errors.js'
import { userRefDtoSchema } from '../auth/schemas.js'
import { multiValueQuery, searchQuery } from '../core/filters.js'
import { pageQuery, sortQuery } from '../core/pagination.js'
import { orgParamsSchema } from '../core/params.js'
import { ORG_ROLES } from '../core/roles.js'
import { teamRefDtoSchema } from '../teams/schemas.js'

// Approvals: every decision a person must make (database/guard-and-approvals.md §4–5; Insights ›
// Approvals, the top-bar popover, notifications). Routes, all under /api/v1/orgs/:orgId/approvals:
// GET / · GET /summary · POST /bulk-decide · GET /:approvalId ·
// POST /:approvalId/{approve,reject,cancel}.
// Approvals are created by Guard, the bridge and agent publishing, never through this API. A
// decision is one conditional update: the loser gets APPROVAL_ALREADY_DECIDED or APPROVAL_EXPIRED.
// Approving above the step-up amount needs a re-authentication within 5 minutes (the auth module
// answers AUTH_STEP_UP_REQUIRED).

export const APPROVAL_KINDS = [
  'ai_action',
  'flow_step',
  'bridge_install',
  'bridge_update',
  'channel_publish',
] as const
export type ApprovalKind = (typeof APPROVAL_KINDS)[number]

/** Kinds Admins and Owners decide; the others follow the rule's approvers. */
export const APPROVAL_REQUEST_KINDS = [
  'bridge_install',
  'bridge_update',
  'channel_publish',
] as const

/** `pending → approved | rejected | expired | canceled`; an escalation keeps it `pending`. */
export const APPROVAL_STATUSES = ['pending', 'approved', 'rejected', 'expired', 'canceled'] as const
export type ApprovalStatus = (typeof APPROVAL_STATUSES)[number]

export const APPROVAL_RISKS = ['low', 'medium', 'high'] as const
export type ApprovalRisk = (typeof APPROVAL_RISKS)[number]

/** What an approval does when nobody decided in time; the strictest wins when rules merge. */
export const APPROVAL_TIMEOUT_ACTIONS = ['reject', 'escalate', 'continue'] as const
export type ApprovalTimeoutAction = (typeof APPROVAL_TIMEOUT_ACTIONS)[number]

export const APPROVAL_RESOLVED_BY = ['user', 'timeout', 'system'] as const
export type ApprovalResolvedBy = (typeof APPROVAL_RESOLVED_BY)[number]

/** Required when a person rejects; `other` needs a note. */
export const APPROVAL_DECISION_REASONS = [
  'wrong_amount',
  'not_eligible',
  'needs_more_information',
  'wrong_team',
  'other',
] as const
export type ApprovalDecisionReason = (typeof APPROVAL_DECISION_REASONS)[number]

/** Where a decision was made, written to `approval.decided`. */
export const APPROVAL_DECISION_VIAS = ['queue', 'popover', 'notification', 'bulk'] as const
export type ApprovalDecisionVia = (typeof APPROVAL_DECISION_VIAS)[number]

export const APPROVER_SUBJECT_TYPES = ['user', 'team', 'role'] as const
export type ApproverSubjectType = (typeof APPROVER_SUBJECT_TYPES)[number]

/**
 * Who may decide, as a rule names them: a person or team by id, or a built-in role by name (that
 * role and every role above it). Custom roles decide through `approvals:decide` and a user or
 * team assignee.
 */
export const approverSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('user'), id: z.uuid() }),
  z.object({ type: z.literal('team'), id: z.uuid() }),
  z.object({ type: z.literal('role'), id: z.enum(ORG_ROLES) }),
])
export type Approver = z.infer<typeof approverSchema>

export const APPROVERS_MAX = 20

/** Most approvals one bulk decision takes. */
export const APPROVAL_BULK_MAX = 50

// ── Payload (`ApprovalPayload` v1) ──────────────────────────────────────────────────────────────

const reasoningSchema = z.object({
  text: z.string().max(1000),
  confidence: z.number().min(0).max(1),
})
const sourceSchema = z.object({
  title: z.string().max(300),
  documentId: z.uuid().nullable(),
  ref: z.string().max(500).nullable(),
})

/** The action a person approves; `input` holds the editable typed fields. */
export const approvalActionSchema = z.object({
  /** A tool, bridge action or action category (`payments.refund`). */
  name: z.string().min(1).max(200),
  input: z.record(z.string(), z.unknown()),
})
export type ApprovalAction = z.infer<typeof approvalActionSchema>

const aiActionPayloadSchema = z.object({
  version: z.literal(1),
  kind: z.literal('ai_action'),
  action: approvalActionSchema,
  reasoning: z.array(reasoningSchema).max(20),
  sources: z.array(sourceSchema).max(50),
  /** The run step (`agent_run_steps.seq`) that asked. */
  stepRef: z.object({ seq: z.number().int().nonnegative() }),
})
const flowStepPayloadSchema = aiActionPayloadSchema.extend({
  kind: z.literal('flow_step'),
  stepRef: z.object({ nodeId: z.string().min(1).max(100) }),
})
const bridgeInstallPayloadSchema = z.object({
  version: z.literal(1),
  kind: z.literal('bridge_install'),
  bridgeId: z.uuid(),
  versionId: z.uuid(),
  requestedScopes: z.array(z.string().max(200)).max(100),
})
const bridgeUpdatePayloadSchema = bridgeInstallPayloadSchema.extend({
  kind: z.literal('bridge_update'),
  addedScopes: z.array(z.string().max(200)).max(100),
})
const channelPublishPayloadSchema = z.object({
  version: z.literal(1),
  kind: z.literal('channel_publish'),
  agentId: z.uuid(),
  channelId: z.uuid(),
  channelType: z.string().min(1).max(50),
  /** What anonymous users can reach. */
  exposure: z.string().max(1000),
})

export const approvalPayloadSchema = z.discriminatedUnion('kind', [
  aiActionPayloadSchema,
  flowStepPayloadSchema,
  bridgeInstallPayloadSchema,
  bridgeUpdatePayloadSchema,
  channelPublishPayloadSchema,
])
export type ApprovalPayload = z.infer<typeof approvalPayloadSchema>

// ── DTOs ────────────────────────────────────────────────────────────────────────────────────────

export const approvalAssigneeDtoSchema = z.object({
  subjectType: z.enum(APPROVER_SUBJECT_TYPES),
  user: userRefDtoSchema.nullable(),
  team: teamRefDtoSchema.nullable(),
  role: z.enum(ORG_ROLES).nullable(),
  /** `escalation` rows were added when a timeout escalated. */
  source: z.enum(['rule', 'escalation']),
})
export type ApprovalAssigneeDto = z.infer<typeof approvalAssigneeDtoSchema>

const idNameSchema = z.object({ id: z.uuid(), name: z.string() })

/**
 * An approval as the queue, the popover and "Decided today" show it. `canDecide` is false for items
 * the viewer can see but is not assigned to ("Assigned to Finance"). `isOverdue` compares the age
 * with the organization's target time; `quickApprovable` is true when the item fits the quick-approve
 * limits and needs no step-up.
 */
export const approvalDtoSchema = z.object({
  id: z.uuid(),
  kind: z.enum(APPROVAL_KINDS),
  status: z.enum(APPROVAL_STATUSES),
  title: z.string(),
  amountMicros: z.number().int().nonnegative().nullable(),
  currency: z.string().length(3),
  /** 0 to 1: the AI's confidence for the action. */
  confidence: z.number().min(0).max(1).nullable(),
  risk: z.enum(APPROVAL_RISKS),
  /** The rule that required it: a guardrail id, or `agent:{id}:v{n}:{ruleId}` / `flow:{id}:v{n}:{nodeId}`. */
  ruleRef: z.string().nullable(),
  /** The guardrail's name when the rule is an organization or team guardrail. */
  ruleName: z.string().nullable(),
  agent: idNameSchema.nullable(),
  flow: idNameSchema.nullable(),
  agentRunId: z.uuid().nullable(),
  flowRunId: z.uuid().nullable(),
  /** The Builder for request kinds; null for AI actions. */
  requestedBy: userRefDtoSchema.nullable(),
  decidedBy: userRefDtoSchema.nullable(),
  decidedAt: z.iso.datetime().nullable(),
  decisionReason: z.enum(APPROVAL_DECISION_REASONS).nullable(),
  decisionNote: z.string().nullable(),
  requiresStepUp: z.boolean(),
  expiresAt: z.iso.datetime().nullable(),
  timeoutAction: z.enum(APPROVAL_TIMEOUT_ACTIONS).nullable(),
  escalatedAt: z.iso.datetime().nullable(),
  resolvedBy: z.enum(APPROVAL_RESOLVED_BY).nullable(),
  assignees: z.array(approvalAssigneeDtoSchema),
  canDecide: z.boolean(),
  isOverdue: z.boolean(),
  quickApprovable: z.boolean(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
})
export type ApprovalDto = z.infer<typeof approvalDtoSchema>

/** `GET …/:approvalId`: the item with what will happen; `editedPayload` is set after "Edit and approve". */
export const approvalDetailDtoSchema = approvalDtoSchema.extend({
  payload: approvalPayloadSchema,
  editedPayload: approvalPayloadSchema.nullable(),
})
export type ApprovalDetailDto = z.infer<typeof approvalDetailDtoSchema>

export const approvalParamsSchema = orgParamsSchema.extend({ approvalId: z.uuid() })
export type ApprovalParams = z.infer<typeof approvalParamsSchema>

/** `GET …/summary`: the top-bar badge and the queue header. */
export const approvalSummaryDtoSchema = z.object({
  pending: z.number().int().nonnegative(),
  /** Pending items the viewer is assigned to. */
  pendingForMe: z.number().int().nonnegative(),
  overdue: z.number().int().nonnegative(),
  decidedToday: z.number().int().nonnegative(),
})
export type ApprovalSummaryDto = z.infer<typeof approvalSummaryDtoSchema>

export const APPROVAL_SORT_FIELDS = ['createdAt', 'decidedAt', 'amountMicros'] as const

/**
 * `GET …/approvals`. Without `status` the queue answers: pending, oldest first. "Decided today"
 * asks for the decided statuses, newest first.
 */
export const listApprovalsQuerySchema = pageQuery.extend({
  q: searchQuery,
  status: multiValueQuery(z.enum(APPROVAL_STATUSES)),
  kind: multiValueQuery(z.enum(APPROVAL_KINDS)),
  risk: multiValueQuery(z.enum(APPROVAL_RISKS)),
  agentId: z.uuid().optional(),
  ruleRef: z.string().min(1).max(300).optional(),
  /** Only items the viewer may decide. */
  canDecide: z.stringbool().optional(),
  /** Only items that fit the quick-approve limits: the bulk-approve selection. */
  quickApprovable: z.stringbool().optional(),
  /** Only items decided since the start of the viewer's day. */
  decidedToday: z.stringbool().optional(),
  sort: sortQuery(APPROVAL_SORT_FIELDS),
})
export type ListApprovalsQuery = z.infer<typeof listApprovalsQuerySchema>

// ── Decisions ───────────────────────────────────────────────────────────────────────────────────

/**
 * `POST …/:approvalId/approve`. `editedInput` is "Edit and approve": the action runs with these
 * fields (validated against the action's input schema; invalid fields answer VALIDATION_FAILED).
 */
export const approveApprovalInputSchema = z.object({
  editedInput: z.record(z.string(), z.unknown()).optional(),
  via: z.enum(['queue', 'popover', 'notification']).default('queue'),
})
export type ApproveApprovalInput = z.infer<typeof approveApprovalInputSchema>

const rejectFields = {
  reason: z.enum(APPROVAL_DECISION_REASONS),
  note: z.string().trim().min(1).max(1000).optional(),
} as const
const noteRequiredForOther = (input: { reason: string; note?: string }) =>
  input.reason !== 'other' || input.note !== undefined

/** `POST …/:approvalId/reject`: the reason is required; `other` needs a note. */
export const rejectApprovalInputSchema = z.object(rejectFields).refine(noteRequiredForOther)
export type RejectApprovalInput = z.infer<typeof rejectApprovalInputSchema>

/**
 * `POST …/bulk-decide`: only items of the same rule that fit the quick-approve limits and need no
 * step-up; each is decided with its own conditional update, so the answer is per item.
 */
export const bulkDecideInputSchema = z
  .object({
    ids: z.array(z.uuid()).min(1).max(APPROVAL_BULK_MAX),
    decision: z.enum(['approve', 'reject']),
    reason: rejectFields.reason.optional(),
    note: rejectFields.note,
  })
  .refine((input) => input.ids.length === new Set(input.ids).size)
  .refine((input) => input.decision !== 'reject' || input.reason !== undefined)
  .refine((input) => input.reason !== 'other' || input.note !== undefined)
export type BulkDecideInput = z.infer<typeof bulkDecideInputSchema>

export const bulkDecideResultDtoSchema = z.object({
  results: z.array(
    z.object({
      id: z.uuid(),
      outcome: z.enum(['decided', 'skipped']),
      /** Why an item was skipped: an API error code such as `APPROVAL_ALREADY_DECIDED`. */
      errorCode: z.enum(Object.values(APPROVALS_ERROR_CODES) as [string, ...string[]]).nullable(),
    }),
  ),
})
export type BulkDecideResultDto = z.infer<typeof bulkDecideResultDtoSchema>
