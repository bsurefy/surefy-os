// SPDX-License-Identifier: AGPL-3.0-only
import {
  AgentRunAgentNotFoundError,
  AgentRunAgentNotPublishedError,
} from '@/modules/agentRuns/index.js'
import { AGENT_AUDIT_ACTIONS } from '@surefy/contracts'
import type {
  AgentChannelConfig,
  AgentChannelCreatedDto,
  AgentChannelDto,
  AgentChannelListDto,
  CreateAgentChannelInput,
  UpdateAgentChannelInput,
} from '@surefy/contracts'

import { channelDto, channelDtos, enableChannel, isEnableable } from './agentPublishing.channels.js'
import {
  ChannelEditForbiddenError,
  ChannelExistsError,
  ChannelNotFoundError,
  ChannelPendingApprovalError,
  ChannelStateInvalidError,
  channelNotAvailable,
} from './agentPublishing.errors.js'
import { generateWidgetToken } from './agentPublishing.tokens.js'

import type { AgentChannelsDeps } from './agentPublishing.channels.js'
import type { AgentChannelsRepository, ChannelRow } from './agentPublishing.repository.js'
import type { DbExecutor, Database } from '@/core/database/index.js'
import type { AgentRunsAgents, AgentRunsContext, RunnableAgent } from '@/modules/agentRuns/index.js'
import type { AuditRecorder } from '@/modules/audit/index.js'

export interface ChannelManagerDeps {
  db: Database
  repository: AgentChannelsRepository
  users: AgentChannelsDeps['users']
  agents: Pick<AgentRunsAgents, 'findUsable'>
  audit: AuditRecorder
}

const UPDATE_BLOCKS = ['widget', 'api', 'slack', 'whatsapp'] as const

/**
 * The channel routes of an agent's Publish tab (database/agents-and-runs.md, §4): list, turn an
 * API or widget channel on, change its settings, pause and resume it, rotate the widget token, and
 * remove it. Who may change channels is the route's permission (`agents:publish-external`); a
 * Builder's request with an approval comes with the approval flow.
 */
export class ChannelManager {
  constructor(private readonly deps: ChannelManagerDeps) {}

  async list(ctx: AgentRunsContext, agentId: string): Promise<AgentChannelListDto> {
    return this.deps.db.tenant(ctx.orgId, async (tx) => {
      await this.visibleAgent(tx, ctx, agentId)
      const rows = await this.deps.repository.listForAgents(tx, ctx.orgId, [agentId])
      return { items: await channelDtos(this.deps.users, rows) }
    })
  }

  async create(
    ctx: AgentRunsContext,
    agentId: string,
    input: CreateAgentChannelInput,
  ): Promise<AgentChannelCreatedDto> {
    if (!isEnableable(input)) throw channelNotAvailable('type', input.type)
    const result = await this.deps.db.tenant(ctx.orgId, async (tx) => {
      const agent = await this.editableAgent(tx, ctx, agentId)
      if (agent.liveVersionId === null) throw new AgentRunAgentNotPublishedError()
      const existing = await this.deps.repository.find(tx, ctx.orgId, agentId, input.type)
      if (existing !== undefined && existing.status !== 'disconnected') {
        throw new ChannelExistsError()
      }
      const { row, token } = await enableChannel(this.deps.repository, tx, {
        orgId: ctx.orgId,
        agentId,
        userId: ctx.userId,
        channel: input,
      })
      await this.record(tx, ctx, AGENT_AUDIT_ACTIONS.AGENT_CHANNEL_CREATED, row)
      return { row, token }
    })
    return { channel: await this.dto(result.row), token: result.token }
  }

  async update(
    ctx: AgentRunsContext,
    agentId: string,
    channelId: string,
    input: UpdateAgentChannelInput,
  ): Promise<AgentChannelDto> {
    const row = await this.deps.db.tenant(ctx.orgId, async (tx) => {
      const channel = await this.changeable(tx, ctx, agentId, channelId)
      const config = configUpdate(channel, input)
      const updated = await this.deps.repository.update(tx, ctx.orgId, channel.id, { config })
      await this.record(tx, ctx, AGENT_AUDIT_ACTIONS.AGENT_CHANNEL_UPDATED, updated)
      return updated
    })
    return this.dto(row)
  }

  /** `active` (or `error`) → `paused`; pausing a paused channel changes nothing. */
  async pause(ctx: AgentRunsContext, agentId: string, channelId: string): Promise<AgentChannelDto> {
    const row = await this.deps.db.tenant(ctx.orgId, async (tx) => {
      const channel = await this.changeable(tx, ctx, agentId, channelId)
      if (channel.status === 'paused') return channel
      const paused = await this.deps.repository.update(tx, ctx.orgId, channel.id, {
        status: 'paused',
      })
      await this.record(tx, ctx, AGENT_AUDIT_ACTIONS.AGENT_CHANNEL_PAUSED, paused)
      return paused
    })
    return this.dto(row)
  }

  /** `paused` → `active`; a channel in `error` is reconnected, not resumed. */
  async resume(
    ctx: AgentRunsContext,
    agentId: string,
    channelId: string,
  ): Promise<AgentChannelDto> {
    const row = await this.deps.db.tenant(ctx.orgId, async (tx) => {
      const channel = await this.changeable(tx, ctx, agentId, channelId)
      if (channel.status === 'active') return channel
      if (channel.status !== 'paused') throw new ChannelStateInvalidError()
      const resumed = await this.deps.repository.update(tx, ctx.orgId, channel.id, {
        status: 'active',
      })
      await this.record(tx, ctx, AGENT_AUDIT_ACTIONS.AGENT_CHANNEL_RESUMED, resumed)
      return resumed
    })
    return this.dto(row)
  }

  /** A new widget token; the previous one stops working at once. Returned once. */
  async rotateToken(
    ctx: AgentRunsContext,
    agentId: string,
    channelId: string,
  ): Promise<AgentChannelCreatedDto> {
    const token = generateWidgetToken()
    const row = await this.deps.db.tenant(ctx.orgId, async (tx) => {
      const channel = await this.changeable(tx, ctx, agentId, channelId)
      if (channel.type !== 'widget') throw channelNotAvailable('channelId', channel.type)
      const rotated = await this.deps.repository.update(tx, ctx.orgId, channel.id, {
        publicTokenHash: token.hash,
        publicTokenPrefix: token.prefix,
      })
      await this.record(tx, ctx, AGENT_AUDIT_ACTIONS.AGENT_CHANNEL_TOKEN_ROTATED, rotated)
      return rotated
    })
    return { channel: await this.dto(row), token: token.secret }
  }

  /** The channel goes `disconnected` and its widget token stops resolving; removing it again is a no-op. */
  async remove(ctx: AgentRunsContext, agentId: string, channelId: string): Promise<void> {
    await this.deps.db.tenant(ctx.orgId, async (tx) => {
      const channel = await this.ownChannel(tx, ctx, agentId, channelId)
      if (channel.status === 'disconnected') return
      const removed = await this.deps.repository.update(tx, ctx.orgId, channel.id, {
        status: 'disconnected',
        publicTokenHash: null,
        publicTokenPrefix: null,
        lastErrorCode: null,
      })
      await this.record(tx, ctx, AGENT_AUDIT_ACTIONS.AGENT_CHANNEL_DISCONNECTED, removed)
    })
  }

  // ── Checks ──────────────────────────────────────────────────────────────────────────────────

  private async visibleAgent(
    tx: DbExecutor,
    ctx: AgentRunsContext,
    agentId: string,
  ): Promise<RunnableAgent> {
    const agent = await this.deps.agents.findUsable(tx, ctx, agentId)
    if (agent?.deletedAt !== null) throw new AgentRunAgentNotFoundError()
    return agent
  }

  private async editableAgent(
    tx: DbExecutor,
    ctx: AgentRunsContext,
    agentId: string,
  ): Promise<RunnableAgent> {
    const agent = await this.visibleAgent(tx, ctx, agentId)
    if (!agent.canEdit) throw new ChannelEditForbiddenError()
    if (agent.status === 'archived') throw new ChannelStateInvalidError()
    return agent
  }

  /** A channel of the agent other than SurefyOS chat, which goes with the agent's publishing. */
  private async ownChannel(
    tx: DbExecutor,
    ctx: AgentRunsContext,
    agentId: string,
    channelId: string,
  ): Promise<ChannelRow> {
    await this.editableAgent(tx, ctx, agentId)
    const channel = await this.deps.repository.findById(tx, ctx.orgId, agentId, channelId)
    if (channel === undefined) throw new ChannelNotFoundError()
    if (channel.type === 'workspace_chat') throw channelNotAvailable('channelId', channel.type)
    return channel
  }

  /** A channel that can change now: not removed, not waiting for an approval. */
  private async changeable(
    tx: DbExecutor,
    ctx: AgentRunsContext,
    agentId: string,
    channelId: string,
  ): Promise<ChannelRow> {
    const channel = await this.ownChannel(tx, ctx, agentId, channelId)
    if (channel.status === 'disconnected') throw new ChannelNotFoundError()
    if (channel.status === 'pending_approval') throw new ChannelPendingApprovalError()
    return channel
  }

  private async record(
    tx: DbExecutor,
    ctx: AgentRunsContext,
    action: string,
    row: ChannelRow,
  ): Promise<void> {
    await this.deps.audit.record(tx, ctx, {
      action,
      target: { type: 'agent_channel', id: row.id },
      metadata: {
        refs: { agentId: row.agentId },
        labels: { type: row.type, status: row.status },
      },
    })
  }

  private async dto(row: ChannelRow): Promise<AgentChannelDto> {
    const [dto] = await channelDtos(this.deps.users, [row])
    return dto ?? channelDto(row, new Map())
  }
}

/** The new config: the block of the channel's own type replaces the old one, nothing else. */
function configUpdate(channel: ChannelRow, input: UpdateAgentChannelInput): AgentChannelConfig {
  for (const block of UPDATE_BLOCKS) {
    if (input[block] !== undefined && block !== channel.type)
      throw channelNotAvailable(block, block)
  }
  if (input.connectionId !== undefined) {
    throw channelNotAvailable('connectionId', channel.type)
  }
  if (channel.type === 'widget' && input.widget !== undefined) {
    return { ...channel.config, widget: input.widget }
  }
  if (channel.type === 'api' && input.api !== undefined) {
    return { ...channel.config, api: input.api }
  }
  throw channelNotAvailable(channel.type, 'missing')
}
