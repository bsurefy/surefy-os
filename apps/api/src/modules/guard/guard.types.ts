// SPDX-License-Identifier: AGPL-3.0-only
import type {
  AgentGuard,
  Approver,
  DoubleCheckResult,
  GuardCheckResult,
  GuardrailImpactDto,
  GuardRuleRowDto,
  OrgRole,
  Permission,
  TeamRefDto,
  UserRefDto,
} from '@surefy/contracts'

import type { ApprovalsContext, CreateApprovalInput, CreatedApproval } from '../approvals/index.js'
import type { DbExecutor } from '@/core/database/index.js'
import type { MlService } from '@/integrations/ml/index.js'
import type { GatewayDecisionRequest, ModelCallContext } from '@/modules/modelGateway/index.js'
import type { OutboxEventInput } from '@/modules/outbox/index.js'
import type { ActorContext, ActorSession } from '@/types/context.js'

/** What the services need from the request: the organization, who acts and what they may do. */
export interface GuardContext {
  orgId: string
  userId: string | null
  via?: ActorContext['via']
  requestId?: string
  ip?: string
  userAgent?: string
  apiKey?: { id: string }
  grantId?: string
  session?: Pick<ActorSession, 'createdAt'>
  role?: OrgRole | null
  teamIds: readonly string[]
  access: { permissions: readonly Permission[] }
}

/** Team names (teams module). */
export interface GuardTeams {
  findRefsInTx(tx: DbExecutor, orgId: string, teamIds: readonly string[]): Promise<TeamRefDto[]>
}

/** People's display data (auth module). */
export interface GuardUserRefs {
  findUserRefs(userIds: readonly string[]): Promise<ReadonlyMap<string, UserRefDto>>
}

/** Writes an outbox event in the caller's transaction (outbox module). */
export interface GuardOutbox {
  write(tx: DbExecutor, event: OutboxEventInput<'guard.rules_changed'>): Promise<boolean>
  /** A best-effort relay right after the commit, so the cached rule set is dropped without waiting. */
  kick(): Promise<void>
}

/** Creates the approval a check asks for (approvals module). */
export interface GuardApprovals {
  create(
    tx: DbExecutor,
    ctx: ApprovalsContext,
    input: CreateApprovalInput,
  ): Promise<CreatedApproval>
}

/** The second AI check of the `double_check` band (model gateway, decision mode). */
export interface GuardModelDecider {
  decide(
    ctx: ModelCallContext,
    request: GatewayDecisionRequest,
  ): Promise<{ value: string | number | boolean; confidence: number; reasoning: string }>
}

/** Detection and masking of personal data (ML service). */
export type GuardPiiService = Pick<MlService, 'detectPii' | 'maskPii'>

/**
 * What the agents, flows and run modules know that Guard shows or reads. Until they land every
 * answer is empty: no agent or flow rows, no dependents, no recorded steps.
 */
export interface GuardSubjects {
  /** Agent- and flow-scoped rules, read from the live definitions: read-only rows of the table. */
  ruleRows(tx: DbExecutor, orgId: string): Promise<readonly GuardRuleRowDto[]>
  /** The agents and flows a guardrail applies to ("Affects 3 agents"), from `dependency_edges`. */
  impact(tx: DbExecutor, orgId: string, guardrailId: string): Promise<GuardrailImpactDto>
  /** How many agents and flows each guardrail applies to; absent ids count 0. */
  usedBy(
    tx: DbExecutor,
    orgId: string,
    guardrailIds: readonly string[],
  ): Promise<ReadonlyMap<string, number>>
  /** Names of agents, for the data-filter exceptions. */
  agentNames(
    tx: DbExecutor,
    orgId: string,
    agentIds: readonly string[],
  ): Promise<ReadonlyMap<string, string>>
  /** Agents whose own thresholds fell below the organization's raised values. */
  outdatedThresholds(
    tx: DbExecutor,
    orgId: string,
    thresholds: { autoBp: number; reviewBp: number },
  ): Promise<{ count: number; firstAgentId: string | null }>
  /** The last confidence values of Guard-checked steps, newest first (0 to 1). */
  recentConfidences(tx: DbExecutor, orgId: string, limit: number): Promise<readonly number[]>
  /** What the checked steps of one UTC day led to, per organization. */
  actionCounts(tx: DbExecutor, day: string): Promise<readonly ActionCounts[]>
  /** The approvers an agent's own approval rule names, for a timeout that escalates. */
  agentRuleEscalation(
    tx: DbExecutor,
    orgId: string,
    ref: { agentId: string; version: number; ruleId: string },
  ): Promise<readonly Approver[] | null>
}

/** Checked steps of one organization and day by what they led to (test runs excluded). */
export interface ActionCounts {
  organizationId: string
  auto: number
  doubleCheck: number
  human: number
  blockedRule: number
  blockedLimit: number
}

export const DEFAULT_ESCALATION: readonly Approver[] = [{ type: 'role', id: 'admin' }]

export const EMPTY_SUBJECTS: GuardSubjects = {
  ruleRows: () => Promise.resolve([]),
  impact: () => Promise.resolve({ dependents: [], listed: [] }),
  usedBy: () => Promise.resolve(new Map()),
  agentNames: () => Promise.resolve(new Map()),
  outdatedThresholds: () => Promise.resolve({ count: 0, firstAgentId: null }),
  recentConfidences: () => Promise.resolve([]),
  actionCounts: () => Promise.resolve([]),
  agentRuleEscalation: () => Promise.resolve(null),
}

/** What a tool call is allowed to do on its own: the tool's permission (agent-runs.md, §5). */
export const TOOL_PERMISSIONS = ['read_only', 'ask_first', 'can_act'] as const
export type ToolPermission = (typeof TOOL_PERMISSIONS)[number]

/** The action Guard checks: a tool, bridge action or category, with its typed input. */
export interface GuardAction {
  /** `payments.refund`: matched by name and by category prefix. */
  name: string
  input: Readonly<Record<string, unknown>>
  permission: ToolPermission
  /** The amount in micros of `currency`, when the action moves money. */
  amountMicros?: number | null
  currency?: string
  /** The question the person sees: "Refund $340 to order #1182". */
  title?: string
}

/** What `guard.check` needs from the executor (agent-runs.md, §5). */
export interface GuardCheckInput {
  agent: { id: string; version: number }
  /** The `guard` section of the live `AgentDefinition`. */
  guard: AgentGuard
  /** The model that reviews actions in the double-check band; null = no review is possible. */
  doubleCheckModelKey: string | null
  action: GuardAction
  /** 0 to 1: how sure the executor is, from `modelGateway.decide`. Null for actions without one. */
  confidence: number | null
  /** The teams that apply: the person's teams, or the owner's for runs without a person. */
  teamIds: readonly string[]
  runId: string
  /** The run step that asked; with `runId` it makes a retried check return the same approval. */
  seq: number
  /** The reasoning and sources the approval shows beside the action. */
  reasoning?: readonly { text: string; confidence: number }[]
  sources?: readonly { title: string; documentId: string | null; ref: string | null }[]
  /** The person the run acts for, recorded as the actor of the audit entries. */
  onBehalfOfUserId?: string | null
  /** Who calls the models of the double check. */
  modelContext: ModelCallContext
  signal?: AbortSignal
}

export type { GuardCheckResult, DoubleCheckResult }
