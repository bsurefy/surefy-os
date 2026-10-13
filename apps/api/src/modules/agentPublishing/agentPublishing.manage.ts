// SPDX-License-Identifier: AGPL-3.0-only
import {
  AgentRunAgentNotFoundError,
  AgentRunAgentNotPublishedError,
} from '@/modules/agentRuns/index.js'
import { AGENT_AUDIT_ACTIONS, PERMISSIONS } from '@surefy/contracts'
import type {
  AgentChannelConfig,
  AgentChannelCreatedDto,
  AgentChannelDto,
  AgentChannelListDto,
  CreateAgentChannelInput,
  UpdateAgentChannelInput,
} from '@surefy/contracts'

import {
  ChannelEditForbiddenError,
  ChannelExistsError,
  ChannelNotFoundError,
  ChannelPendingApprovalError,
  ChannelStateInvalidError,
  channelNotAvailable,
} from './agentPublishing.errors.js'
import { generateWidgetToken } from './agentPublishing.tokens.js'

import type { ChannelRequests, ChannelPresenter } from './agentPublishing.channels.js'
import type {
  AgentChannelsRepository,
  ChannelChanges,
  ChannelRow,
} from './agentPublishing.repository.js'
import type { DbExecutor, Database } from '@/core/database/index.js'
import type { AgentRunsAgents, AgentRunsContext, RunnableAgent } from '@/modules/agentRuns/index.js'
import type { AuditRecorder } from '@/modules/audit/index.js'

export interface ChannelManagerDeps {
  db: Database
  repository: AgentChannelsRepository
  presenter: ChannelPresenter
  requests: ChannelRequests
  agents: Pick<AgentRunsAgents, 'findUsable'>
  audit: AuditRecorder
}

const UPDATE_BLOCKS = ['widget', 'api', 'slack', 'whatsapp'] as const

/** Admins and Owners change channels directly; a Builder's request waits for them. */
const canPublishExternal = (ctx: AgentRunsContext): boolean =>
  ctx.access.permissions.includes(PERMISSIONS.AGENTS_PUBLISH_EXTERNAL)

/**
 * The channel routes of an agent's Publish tab (database/agents-and-runs.md, §4). Anyone who can
 * edit the agent may ask for a channel, take back a request that waits, and issue the token of a
 * widget approved after their request; Admins and Owners turn channels on at once, change, pause,
 * resume, rotate and remove them.
 */
export class ChannelManager {
  constructor(private readonly deps: ChannelManagerDeps) {}

  async list(ctx: AgentRunsContext, agentId: string): Promise<AgentChannelListDto> {
    return this.deps.db.tenant(ctx.orgId, async (tx) => {
      await this.visibleAgent(tx, ctx, agentId)
      const rows = await this.deps.repository.listForAgents(tx, ctx.orgId, [agentId])
      return { items: await this.deps.presenter.dtos(tx, ctx.orgId, rows) }
    })
  }

  /** Turns a channel on for an Admin or Owner; a Builder's becomes a request (`pending_approval`). */
  async create(
    ctx: AgentRunsContext,
    agentId: string,
    input: CreateAgentChannelInput,
  ): Promise<AgentChannelCreatedDto> {
    return this.deps.db.tenant(ctx.orgId, async (tx) => {
      const agent = await this.editableAgent(tx, ctx, agentId)
      if (agent.liveVersionId === null) throw new AgentRunAgentNotPublishedError()
      if (input.type === 'api' || input.type === 'widget') {
        const existing = await this.deps.repository.find(tx, ctx.orgId, agentId, input.type)
        if (existing !== undefined && existing.status !== 'disconnected') {
          throw new ChannelExistsError()
        }
      }
      const { row, token } = await this.deps.requests.enable(
        tx,
        ctx,
        agent,
        input,
        canPublishExternal(ctx),
      )
      await this.record(tx, ctx, AGENT_AUDIT_ACTIONS.AGENT_CHANNEL_CREATED, row)
      return { channel: await this.deps.presenter.dto(tx, ctx.orgId, row), token }
    })
  }

  async update(
    ctx: AgentRunsContext,
    agentId: string,
    channelId: string,
    input: UpdateAgentChannelInput,
  ): Promise<AgentChannelDto> {
    return this.deps.db.tenant(ctx.orgId, async (tx) => {
      const channel = await this.changeable(tx, ctx, agentId, channelId)
      const changes: ChannelChanges = { config: configUpdate(channel, input) }
      if (input.connectionId !== undefined) {
        if (channel.type !== 'slack' && channel.type !== 'whatsapp') {
          throw channelNotAvailable('connectionId', channel.type)
        }
        changes.connectionId = input.connectionId
        changes.externalAccountId = await this.deps.requests.accountOf(
          tx,
          ctx,
          channel.type,
          input.connectionId,
          channel.id,
        )
      }
      const updated = await this.deps.repository.update(tx, ctx.orgId, channel.id, changes)
      await this.record(tx, ctx, AGENT_AUDIT_ACTIONS.AGENT_CHANNEL_UPDATED, updated)
      return this.deps.presenter.dto(tx, ctx.orgId, updated)
    })
  }

  /** `active` (or `error`) → `paused`; pausing a paused channel changes nothing. */
  async pause(ctx: AgentRunsContext, agentId: string, channelId: string): Promise<AgentChannelDto> {
    return this.deps.db.tenant(ctx.orgId, async (tx) => {
      const channel = await this.changeable(tx, ctx, agentId, channelId)
      if (channel.status === 'paused') return this.deps.presenter.dto(tx, ctx.orgId, channel)
      const paused = await this.deps.repository.update(tx, ctx.orgId, channel.id, {
        status: 'paused',
      })
      await this.record(tx, ctx, AGENT_AUDIT_ACTIONS.AGENT_CHANNEL_PAUSED, paused)
      return this.deps.presenter.dto(tx, ctx.orgId, paused)
    })
  }

  /**
   * `paused` → `active`. A Slack or WhatsApp channel in `error` resumes once its connection works
   * again (reconnected in Connections).
   */
  async resume(
    ctx: AgentRunsContext,
    agentId: string,
    channelId: string,
  ): Promise<AgentChannelDto> {
    return this.deps.db.tenant(ctx.orgId, async (tx) => {
      const channel = await this.changeable(tx, ctx, agentId, channelId)
      if (channel.status === 'active') return this.deps.presenter.dto(tx, ctx.orgId, channel)
      if (channel.status === 'error') {
        if (
          channel.connectionId === null ||
          (channel.type !== 'slack' && channel.type !== 'whatsapp')
        ) {
          throw new ChannelStateInvalidError()
        }
        await this.deps.requests.accountOf(tx, ctx, channel.type, channel.connectionId, channel.id)
      }
      const resumed = await this.deps.repository.update(tx, ctx.orgId, channel.id, {
        status: 'active',
        lastErrorCode: null,
      })
      await this.record(tx, ctx, AGENT_AUDIT_ACTIONS.AGENT_CHANNEL_RESUMED, resumed)
      return this.deps.presenter.dto(tx, ctx.orgId, resumed)
    })
  }

  /**
   * A new widget token; the previous one stops working at once. Returned once. Anyone who can
   * edit the agent may issue the first token of a widget approved after their request.
   */
  async rotateToken(
    ctx: AgentRunsContext,
    agentId: string,
    channelId: string,
  ): Promise<AgentChannelCreatedDto> {
    const token = generateWidgetToken()
    return this.deps.db.tenant(ctx.orgId, async (tx) => {
      const channel = await this.changeable(tx, ctx, agentId, channelId)
      if (channel.type !== 'widget') throw channelNotAvailable('channelId', channel.type)
      const issuing = channel.publicTokenPrefix === null
      if (!canPublishExternal(ctx) && !(issuing && channel.status === 'active')) {
        throw new ChannelEditForbiddenError()
      }
      const rotated = await this.deps.repository.update(tx, ctx.orgId, channel.id, {
        publicTokenHash: token.hash,
        publicTokenPrefix: token.prefix,
      })
      await this.record(tx, ctx, AGENT_AUDIT_ACTIONS.AGENT_CHANNEL_TOKEN_ROTATED, rotated)
      return { channel: await this.deps.presenter.dto(tx, ctx.orgId, rotated), token: token.secret }
    })
  }

  /**
   * The channel goes `disconnected` and its widget token stops resolving; removing it again is a
   * no-op. A Builder may only take back a request that waits; its approval is canceled.
   */
  async remove(ctx: AgentRunsContext, agentId: string, channelId: string): Promise<void> {
    await this.deps.db.tenant(ctx.orgId, async (tx) => {
      const channel = await this.ownChannel(tx, ctx, agentId, channelId)
      if (channel.status === 'disconnected') return
      if (!canPublishExternal(ctx) && channel.status !== 'pending_approval') {
        throw new ChannelEditForbiddenError()
      }
      const removed = await this.deps.repository.update(tx, ctx.orgId, channel.id, {
        status: 'disconnected',
        publicTokenHash: null,
        publicTokenPrefix: null,
        lastErrorCode: null,
        approvalId: null,
      })
      await this.deps.requests.withdraw(tx, ctx, channel)
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
}

/** The new config: the block of the channel's own type replaces the old one; other blocks are refused. */
function configUpdate(channel: ChannelRow, input: UpdateAgentChannelInput): AgentChannelConfig {
  for (const block of UPDATE_BLOCKS) {
    if (input[block] !== undefined && block !== channel.type)
      throw channelNotAvailable(block, block)
  }
  switch (channel.type) {
    case 'widget':
      return input.widget === undefined
        ? channel.config
        : { ...channel.config, widget: input.widget }
    case 'api':
      return input.api === undefined ? channel.config : { ...channel.config, api: input.api }
    case 'slack':
      return input.slack === undefined ? channel.config : { ...channel.config, slack: input.slack }
    case 'whatsapp':
      return input.whatsapp === undefined
        ? channel.config
        : { ...channel.config, whatsapp: input.whatsapp }
    default:
      throw channelNotAvailable('channelId', channel.type)
  }
}
