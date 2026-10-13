// SPDX-License-Identifier: AGPL-3.0-only
import { SLACK_EVENTS_PATH, WHATSAPP_WEBHOOK_PATH } from '@surefy/contracts'
import type {
  AgentChannelConfig,
  AgentChannelDto,
  AgentChannelRequest,
  AgentChannelWebhookDto,
  ConnectionStatus,
  UserRefDto,
} from '@surefy/contracts'

import { API_CHANNEL_DEFAULT_RATE_PER_MINUTE } from './agentPublishing.constants.js'
import { ChannelAccountInUseError, channelNotAvailable } from './agentPublishing.errors.js'
import {
  generateWidgetToken,
  unissuedWidgetToken,
  whatsappVerifyToken,
} from './agentPublishing.tokens.js'

import type { AgentChannelsRepository, ChannelRow } from './agentPublishing.repository.js'
import type { Database, DbExecutor } from '@/core/database/index.js'
import type { AgentChannels } from '@/modules/agents/index.js'
import type { ApprovalRow } from '@/modules/approvals/approvals.repository.js'
import type {
  ApprovalRequestOutcome,
  ApprovalRequests,
  ApprovalsContext,
  CreateApprovalInput,
  CreatedApproval,
} from '@/modules/approvals/index.js'
import type { ConnectionPrincipal } from '@/modules/connections/index.js'

/** Who asks for a channel: a person in the organization, with their teams and permissions. */
export type ChannelActor = ApprovalsContext

/** The connection a Slack or WhatsApp channel uses, as the save-time check returns it. */
interface ConnectionRef {
  id: string
  providerKey: string
  status: string
  externalAccountId: string | null
  statusReasonCode: string | null
}

export interface AgentChannelsDeps {
  db: Pick<Database, 'global'>
  repository: AgentChannelsRepository
  users: { findUserRefs(userIds: readonly string[]): Promise<ReadonlyMap<string, UserRefDto>> }
  connections: {
    statuses(
      tx: DbExecutor,
      orgId: string,
      ids: readonly string[],
    ): Promise<ReadonlyMap<string, { name: string; status: ConnectionStatus }>>
    assertUsable(
      tx: DbExecutor,
      orgId: string,
      principal: ConnectionPrincipal,
      connectionId: string,
    ): Promise<ConnectionRef>
  }
  approvals: {
    create(
      tx: DbExecutor,
      ctx: ApprovalsContext,
      input: CreateApprovalInput,
    ): Promise<CreatedApproval>
    cancelPending(
      tx: DbExecutor,
      ctx: ApprovalsContext,
      scope: { approvalId: string },
    ): Promise<string[]>
  }
  /** Where providers deliver events, and the key of the WhatsApp verify tokens. */
  webhooks: { publicUrl: string; verifyKey: string }
}

// ── Presenting ──────────────────────────────────────────────────────────────────────────────────

const TYPE_LABELS: Record<AgentChannelRequest['type'], string> = {
  api: 'the API',
  widget: 'the website widget',
  slack: 'Slack',
  whatsapp: 'WhatsApp',
}

/** The channel rows as the Publish tab shows them. */
export class ChannelPresenter {
  constructor(
    private readonly deps: Pick<AgentChannelsDeps, 'users' | 'connections' | 'webhooks'>,
  ) {}

  async dtos(
    tx: DbExecutor,
    orgId: string,
    rows: readonly ChannelRow[],
  ): Promise<AgentChannelDto[]> {
    const userIds = new Set<string>()
    const connectionIds = new Set<string>()
    for (const row of rows) {
      if (row.requestedByUserId !== null) userIds.add(row.requestedByUserId)
      if (row.approvedByUserId !== null) userIds.add(row.approvedByUserId)
      if (row.connectionId !== null) connectionIds.add(row.connectionId)
    }
    const users =
      userIds.size === 0
        ? new Map<string, UserRefDto>()
        : await this.deps.users.findUserRefs([...userIds])
    const connections =
      connectionIds.size === 0
        ? new Map<string, { name: string; status: ConnectionStatus }>()
        : await this.deps.connections.statuses(tx, orgId, [...connectionIds])
    return rows.map((row) => {
      const connection = row.connectionId === null ? undefined : connections.get(row.connectionId)
      return {
        id: row.id,
        agentId: row.agentId,
        type: row.type,
        status: row.status,
        config: row.config,
        publicTokenPrefix: row.publicTokenPrefix,
        externalAccountId: row.externalAccountId,
        connection:
          row.connectionId === null || connection === undefined
            ? null
            : { id: row.connectionId, name: connection.name, status: connection.status },
        approvalId: row.approvalId,
        requestedBy:
          row.requestedByUserId === null ? null : (users.get(row.requestedByUserId) ?? null),
        approvedBy:
          row.approvedByUserId === null ? null : (users.get(row.approvedByUserId) ?? null),
        lastErrorCode: row.lastErrorCode,
        webhook: this.webhookOf(row),
        lastActiveAt: row.lastActiveAt?.toISOString() ?? null,
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
      }
    })
  }

  async dto(tx: DbExecutor, orgId: string, row: ChannelRow): Promise<AgentChannelDto> {
    const [dto] = await this.dtos(tx, orgId, [row])
    if (dto === undefined) throw new Error('channel dto missing')
    return dto
  }

  private webhookOf(row: ChannelRow): AgentChannelWebhookDto | null {
    const { publicUrl, verifyKey } = this.deps.webhooks
    if (row.type === 'slack') {
      return { url: new URL(SLACK_EVENTS_PATH, publicUrl).href, verifyToken: null }
    }
    if (row.type === 'whatsapp') {
      return {
        url: new URL(WHATSAPP_WEBHOOK_PATH, publicUrl).href,
        verifyToken: whatsappVerifyToken(verifyKey, row.id),
      }
    }
    return null
  }
}

// ── Requesting and turning on ───────────────────────────────────────────────────────────────────

/** The stored config of a channel request: only the block of its own type. */
export const configOf = (channel: AgentChannelRequest): AgentChannelConfig => {
  switch (channel.type) {
    case 'widget':
      return { version: 1, widget: channel.config }
    case 'slack':
      return { version: 1, slack: channel.config }
    case 'whatsapp':
      return { version: 1, whatsapp: channel.config }
    default:
      return {
        version: 1,
        api: {
          rateLimitPerMinute:
            channel.config?.rateLimitPerMinute ?? API_CHANNEL_DEFAULT_RATE_PER_MINUTE,
        },
      }
  }
}

export interface EnabledChannel {
  row: ChannelRow
  /** The widget token, when one was issued now; shown once. */
  token: string | null
}

/**
 * Turning channels on (database/agents-and-runs.md, §4). An Admin or Owner (`external`) turns a
 * channel on at once; a Builder's request waits as `pending_approval` with a `channel_publish`
 * approval for the Admins, and deciding it updates the channel in the same transaction.
 */
export class ChannelRequests implements ApprovalRequests {
  constructor(private readonly deps: AgentChannelsDeps) {}

  async enable(
    tx: DbExecutor,
    ctx: ChannelActor,
    agent: { id: string; name: string },
    channel: AgentChannelRequest,
    external: boolean,
  ): Promise<EnabledChannel> {
    const status = external ? 'active' : 'pending_approval'
    const enabled =
      channel.type === 'slack' || channel.type === 'whatsapp'
        ? { row: await this.external(tx, ctx, agent.id, channel, status), token: null }
        : await this.single(tx, ctx, agent.id, channel, external)
    if (enabled.row.status !== 'pending_approval' || enabled.row.approvalId !== null) return enabled
    const approval = await this.deps.approvals.create(tx, ctx, {
      kind: 'channel_publish',
      title: `Publish ${agent.name} to ${TYPE_LABELS[channel.type]}`,
      payload: {
        version: 1,
        kind: 'channel_publish',
        agentId: agent.id,
        channelId: enabled.row.id,
        channelType: channel.type,
        exposure: '',
      },
      // the channel's own status keeps one request at a time; a reused row asks again
      dedupeKey: null,
      agentId: agent.id,
      requestedByUserId: ctx.userId,
    })
    const row = await this.deps.repository.update(tx, ctx.orgId, enabled.row.id, {
      approvalId: approval.id,
    })
    return { row, token: null }
  }

  /** A removed channel takes back the request it was waiting on. */
  async withdraw(tx: DbExecutor, ctx: ChannelActor, channel: ChannelRow): Promise<void> {
    if (channel.approvalId === null) return
    await this.deps.approvals.cancelPending(tx, ctx, { approvalId: channel.approvalId })
  }

  /** The approvals module's hook: a decided, withdrawn or expired publish request. */
  async settled(
    tx: DbExecutor,
    ctx: Pick<ApprovalsContext, 'orgId' | 'userId'>,
    approval: ApprovalRow,
    outcome: ApprovalRequestOutcome,
  ): Promise<void> {
    const payload = approval.payload
    if (payload.kind !== 'channel_publish') return
    const channel = await this.deps.repository.findInOrg(tx, ctx.orgId, payload.channelId)
    if (channel?.status !== 'pending_approval' || channel.approvalId !== approval.id) return
    if (outcome === 'approved') {
      // a widget's token is issued afterwards, once, by whoever can edit the agent
      await this.deps.repository.update(tx, ctx.orgId, channel.id, {
        status: 'active',
        approvalId: null,
        approvedByUserId: ctx.userId,
      })
      return
    }
    await this.deps.repository.update(tx, ctx.orgId, channel.id, {
      status: 'disconnected',
      approvalId: null,
      publicTokenHash: null,
      publicTokenPrefix: null,
    })
  }

  /**
   * The API or widget channel, one per agent. A widget channel that still has its token keeps
   * it, so a site that embeds it keeps working; a new one gets a token, returned once, or an
   * unissued one while it waits. A Builder's request for a channel that is already on changes
   * nothing.
   */
  private async single(
    tx: DbExecutor,
    ctx: ChannelActor,
    agentId: string,
    channel: Extract<AgentChannelRequest, { type: 'api' | 'widget' }>,
    external: boolean,
  ): Promise<EnabledChannel> {
    const { orgId } = ctx
    const existing = await this.deps.repository.find(tx, orgId, agentId, channel.type)
    const live = existing !== undefined && existing.status !== 'disconnected'
    if (live && !external) return { row: existing, token: null }
    const values = {
      orgId,
      agentId,
      type: channel.type,
      config: configOf(channel),
      requestedByUserId: live ? existing.requestedByUserId : ctx.userId,
      status: external ? ('active' as const) : ('pending_approval' as const),
    }
    let token: string | null = null
    let row: ChannelRow
    if (channel.type !== 'widget') {
      row = await this.deps.repository.activate(tx, values)
    } else if (!external) {
      row = await this.deps.repository.activate(tx, { ...values, token: unissuedWidgetToken() })
    } else if (existing?.publicTokenHash != null && existing.publicTokenPrefix !== null) {
      // the row's CHECK sees the proposed row before the conflict: it carries the kept token
      const kept = { hash: existing.publicTokenHash, prefix: existing.publicTokenPrefix }
      row = await this.deps.repository.activate(tx, { ...values, token: kept })
    } else {
      const issued = generateWidgetToken()
      row = await this.deps.repository.activate(tx, {
        ...values,
        token: { hash: issued.hash, prefix: issued.prefix },
      })
      token = issued.secret
    }
    // an Admin who turns on a channel that waited takes the place of the decision
    if (external && existing?.status === 'pending_approval') await this.withdraw(tx, ctx, existing)
    return { row, token }
  }

  /** A Slack or WhatsApp channel through a connection of that app, on an account no one else uses. */
  private async external(
    tx: DbExecutor,
    ctx: ChannelActor,
    agentId: string,
    channel: Extract<AgentChannelRequest, { type: 'slack' | 'whatsapp' }>,
    status: 'active' | 'pending_approval',
  ): Promise<ChannelRow> {
    const account = await this.accountOf(tx, ctx, channel.type, channel.connectionId)
    return this.deps.repository.insertExternal(tx, {
      orgId: ctx.orgId,
      agentId,
      type: channel.type,
      status,
      config: configOf(channel),
      connectionId: channel.connectionId,
      externalAccountId: account,
      requestedByUserId: ctx.userId,
    })
  }

  /**
   * The account a connection answers for (Slack `{team_id}/{bot_user_id}`, the WhatsApp phone
   * number id), after the save-time checks: the person may use it, it is the channel's app, it
   * works, and no other channel answers for that account.
   */
  async accountOf(
    tx: DbExecutor,
    ctx: ChannelActor,
    type: 'slack' | 'whatsapp',
    connectionId: string,
    exceptChannelId?: string,
  ): Promise<string> {
    const connection = await this.deps.connections.assertUsable(
      tx,
      ctx.orgId,
      { userId: ctx.userId, teamIds: ctx.teamIds },
      connectionId,
    )
    if (connection.providerKey !== type) throw channelNotAvailable('connectionId', 'provider')
    if (connection.status !== 'active' || connection.externalAccountId === null) {
      throw channelNotAvailable('connectionId', connection.statusReasonCode ?? connection.status)
    }
    const account = connection.externalAccountId.toLowerCase()
    const taken = await this.deps.repository.resolveExternal(this.deps.db.global, type, account)
    if (taken !== undefined && taken.channelId !== exceptChannelId) {
      throw new ChannelAccountInUseError()
    }
    return account
  }
}

/**
 * The agents module's view of channels (database/agents-and-runs.md, §4): SurefyOS chat goes
 * active with the first publish; the external channels go active for Admins and Owners and wait
 * for an approval when a Builder asks for them.
 */
export function createAgentChannels(deps: {
  repository: AgentChannelsRepository
  presenter: ChannelPresenter
  requests: ChannelRequests
}): AgentChannels {
  return {
    async list(tx, orgId, agentIds) {
      const rows = await deps.repository.listForAgents(tx, orgId, agentIds)
      const byAgent = new Map<string, AgentChannelDto[]>()
      const list = await deps.presenter.dtos(tx, orgId, rows)
      for (const dto of list) byAgent.set(dto.agentId, [...(byAgent.get(dto.agentId) ?? []), dto])
      return byAgent
    },

    async publish(tx, ctx, agent, request) {
      await deps.repository.activate(tx, {
        orgId: ctx.orgId,
        agentId: agent.id,
        type: 'workspace_chat',
        config: { version: 1 },
        requestedByUserId: ctx.userId,
      })
      const widgetTokens: Record<string, string> = {}
      for (const channel of request.channels) {
        const { row, token } = await deps.requests.enable(tx, ctx, agent, channel, request.external)
        if (token !== null) widgetTokens[row.id] = token
      }
      const rows = await deps.repository.listForAgents(tx, ctx.orgId, [agent.id])
      return { channels: await deps.presenter.dtos(tx, ctx.orgId, rows), widgetTokens }
    },

    async disconnectAll(tx, ctx, agentId) {
      const rows = await deps.repository.listForAgents(tx, ctx.orgId, [agentId])
      await deps.repository.disconnectAll(tx, ctx.orgId, agentId)
      for (const row of rows) await deps.requests.withdraw(tx, ctx, row)
    },
  }
}
