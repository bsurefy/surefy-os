// SPDX-License-Identifier: AGPL-3.0-only
import { GUARD_DEFAULTS } from '@surefy/contracts'
import type {
  Approver,
  ApprovalKind,
  ApprovalPayload,
  ApprovalRisk,
  ApprovalTimeoutAction,
  OrgRole,
  Permission,
  TeamRefDto,
  UserRefDto,
} from '@surefy/contracts'

import type { ApprovalRow } from './approvals.repository.js'
import type { DbExecutor } from '@/core/database/index.js'
import type { NotifyInput } from '@/modules/notifications/notifications.types.js'
import type { OutboxEventInput } from '@/modules/outbox/index.js'
import type { ActorContext, ActorSession } from '@/types/context.js'
import type { SQL } from 'drizzle-orm'

/** What the service needs from the request: the organization, who acts and what they may do. */
export interface ApprovalsContext {
  orgId: string
  userId: string | null
  via?: ActorContext['via']
  requestId?: string
  ip?: string
  userAgent?: string
  apiKey?: { id: string }
  grantId?: string
  /** The sign-in the step-up check reads. */
  session?: Pick<ActorSession, 'createdAt'>
  role?: OrgRole | null
  teamIds: readonly string[]
  access: { permissions: readonly Permission[] }
}

/** The access module's fresh-session rule (`AccessService.assertFreshSession`). */
export interface ApprovalsAccess {
  assertFreshSession(ctx: { session?: Pick<ActorSession, 'createdAt'> }): void
}

/** Team names (teams module). */
export interface ApprovalsTeams {
  findRefsInTx(tx: DbExecutor, orgId: string, teamIds: readonly string[]): Promise<TeamRefDto[]>
}

/** People's display data (auth module). */
export interface ApprovalsUserRefs {
  findUserRefs(userIds: readonly string[]): Promise<ReadonlyMap<string, UserRefDto>>
}

/** Writes in-app notifications (notifications module). */
export interface ApprovalsNotifier {
  notify(ctx: { orgId: string }, input: NotifyInput): Promise<unknown>
}

export type ApprovalTopic =
  'approval.requested' | 'approval.decided' | 'approval.expired' | 'approval.escalated'

/** Writes an outbox event in the caller's transaction (outbox module). */
export interface ApprovalsOutbox {
  write(tx: DbExecutor, event: OutboxEventInput<ApprovalTopic>): Promise<boolean>
  /** A best-effort relay right after the commit, so a decision continues its run without waiting. */
  kick(): Promise<void>
}

/** The organization's Guard settings that decide how an approval is treated. */
export interface ApprovalLimits {
  /** Largest amount quick approve and bulk approve may decide; 0 means no money. */
  quickApproveMaxAmountMicros: number
  quickApproveMaxRisk: 'low' | 'medium'
  /** Approvals above this amount need re-authentication; null means never. */
  stepUpAmountMicros: number | null
  /** Age after which the queue shows a warning. */
  targetDecisionMinutes: number
}

/**
 * What `guard` provides: the settings (a missing row means the defaults) and, for a timeout that
 * escalates, the approvers the rule names (default: role `admin`).
 */
export interface ApprovalsGuard {
  limits(tx: DbExecutor, orgId: string): Promise<ApprovalLimits>
  /** The names of organization and team guardrails, by rule reference. */
  ruleNames(
    tx: DbExecutor,
    orgId: string,
    ruleRefs: readonly string[],
  ): Promise<ReadonlyMap<string, string>>
  escalationTargets(
    tx: DbExecutor,
    orgId: string,
    approval: Pick<ApprovalRow, 'ruleRef' | 'agentId' | 'flowId'>,
  ): Promise<readonly Approver[]>
}

export const DEFAULT_ESCALATION: readonly Approver[] = [{ type: 'role', id: 'admin' }]

export const DEFAULT_GUARD: ApprovalsGuard = {
  limits: () =>
    Promise.resolve({
      quickApproveMaxAmountMicros: GUARD_DEFAULTS.quickApproveMaxAmountMicros,
      quickApproveMaxRisk: GUARD_DEFAULTS.quickApproveMaxRisk,
      stepUpAmountMicros: GUARD_DEFAULTS.stepUpAmountMicros,
      targetDecisionMinutes: GUARD_DEFAULTS.targetDecisionMinutes,
    }),
  ruleNames: () => Promise.resolve(new Map()),
  escalationTargets: () => Promise.resolve(DEFAULT_ESCALATION),
}

/** The agent or flow an approval came from: what `agents` and `flows` provide as they land. */
export interface ApprovalSubjects {
  /** Names of agents and flows, for the list. A missing id shows without a name. */
  names(
    tx: DbExecutor,
    orgId: string,
    refs: { agentIds: readonly string[]; flowIds: readonly string[] },
  ): Promise<{
    agents: ReadonlyMap<string, string>
    flows: ReadonlyMap<string, string>
  }>
  /** Whether the person can see the agent or flow of an AI action; deciding needs it. */
  canAccess(tx: DbExecutor, ctx: ApprovalsContext, approval: ApprovalRow): Promise<boolean>
  /**
   * Extra rows people without `guard:manage` may see read-only ("Assigned to Finance"): the
   * approvals of agents and flows they can reach. Without it they see what they can decide and
   * what they requested.
   */
  visibility(ctx: ApprovalsContext): SQL | null
  /**
   * The edited fields checked against the action's input schema. Returns the fields that are not
   * valid; the default accepts the fields the original action had.
   */
  invalidEditFields(
    tx: DbExecutor,
    orgId: string,
    approval: ApprovalRow,
    input: Readonly<Record<string, unknown>>,
  ): Promise<readonly string[]>
}

export const DEFAULT_SUBJECTS: ApprovalSubjects = {
  names: () => Promise.resolve({ agents: new Map(), flows: new Map() }),
  canAccess: () => Promise.resolve(true),
  visibility: () => null,
  invalidEditFields: (_tx, _orgId, approval, input) => {
    const payload = approval.payload
    if (payload.kind !== 'ai_action' && payload.kind !== 'flow_step') return Promise.resolve([])
    const known = new Set(Object.keys(payload.action.input))
    return Promise.resolve(Object.keys(input).filter((field) => !known.has(field)))
  },
}

/**
 * What Guard, the bridge and agent publishing pass to create an approval, in the transaction that
 * pauses the run or records the request. `dedupeKey` makes a retry return the first approval.
 */
export interface CreateApprovalInput {
  kind: ApprovalKind
  title: string
  payload: ApprovalPayload
  amountMicros?: number | null
  currency?: string
  confidence?: number | null
  risk?: ApprovalRisk
  ruleRef?: string | null
  dedupeKey?: string | null
  agentId?: string | null
  agentRunId?: string | null
  flowId?: string | null
  flowRunId?: string | null
  /** The Builder for the request kinds; null for AI actions. */
  requestedByUserId?: string | null
  /** Minutes to wait; null waits until decided or canceled. */
  waitMinutes?: number | null
  /** What the wait ends in; `reject` unless the rule says otherwise. */
  timeoutAction?: ApprovalTimeoutAction
  /** The rule's approvers. The request kinds always go to role `admin`; others default to it too. */
  assignees?: readonly Approver[]
}

export interface CreatedApproval {
  id: string
  /** False when `dedupeKey` matched an approval created before. */
  created: boolean
}

/** How an approval of an AI action ended, as the run that waits for it needs to know. */
export interface ApprovalResolution {
  id: string
  status: ApprovalRow['status']
  /** `approved`, `approved_with_edits` and `timed_out_continued` run the action; the rest do not. */
  outcome:
    | 'pending'
    | 'approved'
    | 'approved_with_edits'
    | 'rejected'
    | 'timed_out_rejected'
    | 'timed_out_continued'
  /** The fields an approver changed ("Edit and approve"), with the original action's others. */
  editedInput: Readonly<Record<string, unknown>> | null
  /** The guardrail or agent rule the approval came from. */
  ruleRef: string | null
  /** The run that waits for it; null for the request kinds. */
  agentRunId: string | null
  decidedAt: Date | null
}

/** How a request ended, for the module that owns what was requested. */
export type ApprovalRequestOutcome = 'approved' | 'rejected' | 'canceled' | 'expired'

/**
 * The module behind a request kind (a channel publish, a bridge install) applies the outcome to
 * its own row in the same transaction as the decision, the withdrawal, the cancel or the expiry.
 */
export interface ApprovalRequests {
  settled(
    tx: DbExecutor,
    ctx: Pick<ApprovalsContext, 'orgId' | 'userId'>,
    approval: ApprovalRow,
    outcome: ApprovalRequestOutcome,
  ): Promise<void>
}

/** Until a module handles its request kinds, an outcome changes nothing else. */
export const NO_REQUESTS: ApprovalRequests = { settled: () => Promise.resolve() }
