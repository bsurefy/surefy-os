// SPDX-License-Identifier: AGPL-3.0-only
import { UnprocessableError } from '@/core/errors/index.js'
import { ERROR_CODES } from '@surefy/contracts'
import type {
  AgentChannelDto,
  AgentDto,
  AgentChannelRequest,
  AgentDefinition,
  AgentTrustDto,
  ConnectionStatus,
  DiscoverMcpActionsDto,
  DiscoverMcpActionsInput,
  EffectiveAccessDto,
  ModelRefDto,
  OrgRole,
  TeamRefDto,
  TestAgentToolDto,
  TestAgentToolInput,
  UserRefDto,
} from '@surefy/contracts'

import type { DbExecutor } from '@/core/database/index.js'
import type { OutboxEventInput } from '@/modules/outbox/index.js'
import type { ActorContext } from '@/types/context.js'

/** What the service needs from the request: the organization, who acts and what they may do. */
export interface AgentsContext {
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

/** Team names (teams module). */
export interface AgentsTeams {
  findRefsInTx(tx: DbExecutor, orgId: string, teamIds: readonly string[]): Promise<TeamRefDto[]>
  /** The teams a person belongs to, to check a model for each person of the audience. */
  listTeamIdsForUserInTx(tx: DbExecutor, orgId: string, userId: string): Promise<string[]>
}

/** People's display data (auth module). */
export interface AgentsUserRefs {
  findUserRefs(userIds: readonly string[]): Promise<ReadonlyMap<string, UserRefDto>>
}

/** Bumps `organizations.access_version` (organizations module). */
export interface AgentsOrganizations {
  bumpAccessVersionInTx(tx: DbExecutor, orgId: string): Promise<void>
}

/** Who a model is checked for: everyone, a team, or a person (with their teams). */
export type AudienceSubject =
  | { type: 'organization' }
  | { type: 'team'; teamId: string }
  | { type: 'user'; userId: string; teamIds: readonly string[] }

/** The Vault's models as agents use them. */
export interface AgentsModels {
  /** Display data of models by key; unknown keys are left out. */
  refs(
    tx: DbExecutor,
    orgId: string,
    modelKeys: readonly string[],
  ): Promise<ReadonlyMap<string, ModelRefDto>>
  /** Keys that are missing, switched off or no longer available. */
  unavailable(
    tx: DbExecutor,
    orgId: string,
    modelKeys: readonly string[],
  ): Promise<ReadonlySet<string>>
  /** Whether the subject may call the model (an access rule and the provider rules of the access chain). */
  isAllowedFor(
    tx: DbExecutor,
    orgId: string,
    modelKey: string,
    subject: AudienceSubject,
  ): Promise<boolean>
  /** The models the person may use, by name: for a new agent's model and a template's suggestion. */
  allowedFor(tx: DbExecutor, ctx: AgentsContext): Promise<readonly ModelRefDto[]>
}

/** Connections as agents use them (connections module). */
export interface AgentsConnections {
  /** Save-time rule: the person may use this connection and it works; throws otherwise. */
  assertUsable(
    tx: DbExecutor,
    orgId: string,
    principal: { userId: string | null; teamIds: readonly string[] },
    connectionId: string,
  ): Promise<unknown>
  /** Name and status of connections; missing ids are left out. */
  statuses(
    tx: DbExecutor,
    orgId: string,
    connectionIds: readonly string[],
  ): Promise<ReadonlyMap<string, { name: string; status: ConnectionStatus }>>
}

/** The organization's Guard defaults (guard module). */
export interface AgentsGuard {
  /** The organization's automatic and review thresholds, in basis points. */
  organizationThresholdsInTx(
    tx: DbExecutor,
    orgId: string,
  ): Promise<{ autoBp: number; reviewBp: number }>
}

/** The editor's test call and MCP discovery (agentTools module). */
export interface AgentsToolProbe {
  testApi(
    ctx: { orgId: string; principal: { userId: string | null; teamIds: readonly string[] } },
    input: TestAgentToolInput,
  ): Promise<TestAgentToolDto>
  discover(
    ctx: { orgId: string; principal: { userId: string | null; teamIds: readonly string[] } },
    input: DiscoverMcpActionsInput,
  ): Promise<DiscoverMcpActionsDto>
}

/** Writes an outbox event in the caller's transaction (outbox module). */
export interface AgentsOutbox {
  write(tx: DbExecutor, event: OutboxEventInput<'agent.published'>): Promise<boolean>
  kick(): Promise<void>
}

// ── Ports for modules that land later ───────────────────────────────────────────────────────────

/** An agent as the channels and dependency ports see it. */
export interface AgentRef {
  id: string
  name: string
  ownerUserId: string | null
}

/**
 * The agent's channels (`agentPublishing`). Until it lands an agent has none: SurefyOS chat is
 * implied by the live version, and a requested external channel is refused.
 */
export interface AgentChannels {
  /** Channels per agent; agents without any are absent. */
  list(
    tx: DbExecutor,
    orgId: string,
    agentIds: readonly string[],
  ): Promise<ReadonlyMap<string, readonly AgentChannelDto[]>>
  /**
   * Inside the publish transaction: SurefyOS chat goes active, and each requested external
   * channel goes active (`external`) or waits for an Admin's approval. Returns the channels of
   * the agent and the one-time widget tokens by channel id.
   */
  publish(
    tx: DbExecutor,
    ctx: AgentsContext,
    agent: AgentRef,
    request: { channels: readonly AgentChannelRequest[]; external: boolean },
  ): Promise<{
    channels: readonly AgentChannelDto[]
    widgetTokens: Readonly<Record<string, string>>
  }>
  /** Inside a tombstoning delete: every channel is disconnected and its token dropped. */
  disconnectAll(tx: DbExecutor, ctx: AgentsContext, agentId: string): Promise<void>
}

/** What an agent uses (`dependency_edges`). Replace, never patch. */
export interface AgentDependencies {
  /** Replaces the edges of the agent's live or draft definition. */
  replace(
    tx: DbExecutor,
    orgId: string,
    agentId: string,
    state: 'live' | 'draft',
    definition: AgentDefinition,
  ): Promise<void>
  /** Removes every edge of the agent. */
  remove(tx: DbExecutor, orgId: string, agentId: string): Promise<void>
}

type AgentLastRunStatus = NonNullable<AgentDto['lastRun']>['status']

/** What the runs say about an agent (`agentRuns`). */
export interface AgentRunSummary {
  lastRun: { status: AgentLastRunStatus; at: Date } | null
  runsThisWeek: number
  trust: AgentTrustDto
  /** The last runs all failed. */
  recentRunsFailed: boolean
}

export interface AgentRuns {
  summaries(
    tx: DbExecutor,
    orgId: string,
    agentIds: readonly string[],
  ): Promise<ReadonlyMap<string, AgentRunSummary>>
  /** Runs that are not tests, and so decide between deleting an agent and keeping a tombstone. */
  countRuns(tx: DbExecutor, orgId: string, agentId: string): Promise<number>
  /** When the draft was last tried in the Test tab; null when it never was. */
  lastTestRunAt(tx: DbExecutor, orgId: string, agentId: string): Promise<Date | null>
}

/** Pending approvals per agent (approvals module). */
export interface AgentApprovals {
  waitingCounts(
    tx: DbExecutor,
    orgId: string,
    agentIds: readonly string[],
  ): Promise<ReadonlyMap<string, number>>
}

/** No channel module yet: SurefyOS chat is implied, and an external channel cannot be created. */
export const NO_CHANNELS: AgentChannels = {
  list: () => Promise.resolve(new Map()),
  publish: (_tx, _ctx, _agent, request) =>
    request.channels.length === 0
      ? Promise.resolve({ channels: [], widgetTokens: {} })
      : Promise.reject(
          new UnprocessableError(
            ERROR_CODES.VALIDATION_FAILED,
            'External channels are not available',
            {
              details: [{ field: 'channels' }],
            },
          ),
        ),
  disconnectAll: () => Promise.resolve(),
}

export const NO_DEPENDENCIES: AgentDependencies = {
  replace: () => Promise.resolve(),
  remove: () => Promise.resolve(),
}

export const NO_RUNS: AgentRuns = {
  summaries: () => Promise.resolve(new Map()),
  countRuns: () => Promise.resolve(0),
  lastTestRunAt: () => Promise.resolve(null),
}

export const NO_APPROVALS: AgentApprovals = {
  waitingCounts: () => Promise.resolve(new Map()),
}

export const EMPTY_RUN_SUMMARY: AgentRunSummary = {
  lastRun: null,
  runsThisWeek: 0,
  trust: { score: null, runs: 0 },
  recentRunsFailed: false,
}
