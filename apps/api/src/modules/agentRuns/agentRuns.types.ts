// SPDX-License-Identifier: AGPL-3.0-only
import type {
  AgentDefinition,
  AgentTool,
  AgentRunInput,
  AgentRunStatus,
  AgentRunTrigger,
  EffectiveAccessDto,
  GuardCheckResult,
  ModelRefDto,
  OrgRole,
  UserRefDto,
} from '@surefy/contracts'

import type { DbExecutor } from '@/core/database/index.js'
import type { agentRuns } from '@/database/tables/agentRuns.tables.js'
import type { agentRunSteps } from '@/database/tables/partitioned/agentRuns.tables.js'
import type { AgentToolsContext, ResolvedTool, ToolOutcome } from '@/modules/agentTools/index.js'
import type { ApprovalResolution, ApprovalsContext } from '@/modules/approvals/index.js'
import type {
  GuardCheckContext,
  GuardCheckInput,
  PiiFilterInput,
  PiiFilterResult,
  PiiRequestInput,
  PiiRequestResult,
} from '@/modules/guard/index.js'
import type { RetrievalRequest, RetrievalResult } from '@/modules/knowledge/index.js'
import type {
  GatewayDecisionRequest,
  GatewayDecisionResult,
  GatewayStream,
  GatewayStreamRequest,
  ModelCallContext,
} from '@/modules/modelGateway/index.js'
import type { OutboxEventInput } from '@/modules/outbox/index.js'
import type { ActorContext } from '@/types/context.js'

export type RunRow = typeof agentRuns.$inferSelect
export type NewRunRow = typeof agentRuns.$inferInsert
export type StepRow = typeof agentRunSteps.$inferSelect
export type NewStepRow = typeof agentRunSteps.$inferInsert

/** What the service needs from the request: the organization, who acts and what they may do. */
export interface AgentRunsContext {
  orgId: string
  userId: string | null
  via?: ActorContext['via']
  requestId?: string
  ip?: string
  userAgent?: string
  apiKey?: { id: string }
  grantId?: string
  role?: OrgRole | null
  teamIds: readonly string[]
  access: Pick<EffectiveAccessDto, 'permissions' | 'limits' | 'reasons'>
}

/** The agent as a run needs it. */
export interface RunnableAgent {
  id: string
  name: string
  status: 'draft' | 'active' | 'paused' | 'archived'
  ownerUserId: string | null
  liveVersionId: string | null
  draftDefinition: AgentDefinition
  deletedAt: Date | null
  /** The caller may edit it (test runs need it); false when no caller is known. */
  canEdit: boolean
}

export interface RunnableVersion {
  id: string
  version: number
  definition: AgentDefinition
}

/** The agents module's rows (a port over its repository). */
export interface AgentRunsAgents {
  /** The agent if the caller may use it (owner, `agents:manage-all` or an audience row). */
  findUsable(
    tx: DbExecutor,
    ctx: AgentRunsContext,
    agentId: string,
  ): Promise<RunnableAgent | undefined>
  /** The agent without a viewer: the executor and the sweeper act for the organization. */
  findById(tx: DbExecutor, orgId: string, agentId: string): Promise<RunnableAgent | undefined>
  findVersion(
    tx: DbExecutor,
    orgId: string,
    agentId: string,
    versionId: string,
  ): Promise<RunnableVersion | undefined>
}

/** A member's access as a run reads it (access module). */
export interface RunPerson {
  role: OrgRole
  teamIds: readonly string[]
  primaryTeamId: string | null
}

export interface AgentRunsPeople {
  /** Null for a person who is not an active member. */
  forMember(orgId: string, userId: string): Promise<RunPerson | null>
}

/** People's display data (auth module). */
export interface AgentRunsUsers {
  findUserRefs(userIds: readonly string[]): Promise<ReadonlyMap<string, UserRefDto>>
}

/** Display data of models by key (the Vault's models, through the agents module's port). */
export interface AgentRunsModels {
  refs(
    tx: DbExecutor,
    orgId: string,
    modelKeys: readonly string[],
  ): Promise<ReadonlyMap<string, ModelRefDto>>
}

/** `guard.check` (guard module). */
export interface AgentRunsGuard {
  check(ctx: GuardCheckContext, input: GuardCheckInput): Promise<GuardCheckResult>
}

/** The personal-data filter (guard module), applied before a request goes to a cloud model. */
export interface AgentRunsPii {
  applyToRequest(input: PiiRequestInput): Promise<PiiRequestResult>
  apply(input: PiiFilterInput): Promise<PiiFilterResult>
}

/** The model gateway's streaming and decision calls. */
export interface AgentRunsGateway {
  streamText(ctx: ModelCallContext, request: GatewayStreamRequest): Promise<GatewayStream>
  decide(ctx: ModelCallContext, request: GatewayDecisionRequest): Promise<GatewayDecisionResult>
}

/** The tool adapters (agentTools). */
export interface AgentRunsTools {
  resolve(ctx: AgentToolsContext, tools: readonly AgentTool[]): Promise<ResolvedTool[]>
  execute(
    ctx: AgentToolsContext,
    tool: ResolvedTool,
    args: Record<string, unknown>,
    signal?: AbortSignal,
  ): Promise<ToolOutcome>
}

/** Knowledge retrieval (knowledge module). */
export interface AgentRunsKnowledge {
  retrieve(request: RetrievalRequest): Promise<RetrievalResult>
}

/** What the run engine asks of approvals. */
export interface AgentRunsApprovals {
  cancelPending(
    tx: DbExecutor,
    ctx: ApprovalsContext,
    scope: { agentRunId: string },
  ): Promise<string[]>
  resolutionsOf(
    tx: DbExecutor,
    orgId: string,
    ids: readonly string[],
  ): Promise<ReadonlyMap<string, ApprovalResolution>>
  resolutionsForRun(
    tx: DbExecutor,
    orgId: string,
    runId: string,
  ): Promise<readonly ApprovalResolution[]>
}

export type AgentRunsTopic = 'agent_run.finished'

/** Writes an outbox event in the caller's transaction (outbox module). */
export interface AgentRunsOutbox {
  write(tx: DbExecutor, event: OutboxEventInput<AgentRunsTopic>): Promise<boolean>
  kick(): Promise<void>
}

/** One chunk of the run's event stream: an AI SDK chunk or a `data-*` chunk of the run contract. */
export interface RunEventChunk {
  type: string
  [key: string]: unknown
}

/** The live view of a run: a Redis stream per run. Best effort: the steps are the truth. */
export interface AgentRunsEvents {
  publish(orgId: string, runId: string, chunk: RunEventChunk): Promise<void>
}

/** Starts the executor for a run, with the job id that deduplicates it. */
export interface AgentRunsDispatcher {
  /** `approvalId` marks a resume job: the run was just taken back from `waiting_approval`. */
  execute(orgId: string, runId: string, jobId: string, approvalId?: string): Promise<void>
}

export interface StartRunInput {
  agentId: string
  trigger: AgentRunTrigger
  input: Pick<AgentRunInput, 'messages'> & Partial<Pick<AgentRunInput, 'externalRef' | 'metadata'>>
  channelId?: string | null
  chatId?: string | null
  /** Retry of an earlier run: where it came from and, for "Retry step", the steps to reuse. */
  retryOf?: { runId: string; seq: number | null }
  reuse?: readonly StepRow[]
}

export interface StartedRun {
  run: RunRow
  created: boolean
}

export const isActiveStatus = (status: AgentRunStatus): boolean =>
  status === 'queued' || status === 'running' || status === 'waiting_approval'
