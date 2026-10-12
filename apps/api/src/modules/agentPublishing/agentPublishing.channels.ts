// SPDX-License-Identifier: AGPL-3.0-only
import type {
  AgentChannelConfig,
  AgentChannelDto,
  AgentChannelRequest,
  UserRefDto,
} from '@surefy/contracts'

import { API_CHANNEL_DEFAULT_RATE_PER_MINUTE } from './agentPublishing.constants.js'
import { channelNotAvailable } from './agentPublishing.errors.js'
import { generateWidgetToken } from './agentPublishing.tokens.js'

import type { AgentChannelsRepository, ChannelRow } from './agentPublishing.repository.js'
import type { DbExecutor } from '@/core/database/index.js'
import type { AgentChannels } from '@/modules/agents/index.js'

export interface AgentChannelsDeps {
  repository: AgentChannelsRepository
  users: { findUserRefs(userIds: readonly string[]): Promise<ReadonlyMap<string, UserRefDto>> }
}

export const channelDto = (
  row: ChannelRow,
  users: ReadonlyMap<string, UserRefDto>,
): AgentChannelDto => ({
  id: row.id,
  agentId: row.agentId,
  type: row.type,
  status: row.status,
  config: row.config,
  publicTokenPrefix: row.publicTokenPrefix,
  externalAccountId: row.externalAccountId,
  // Slack and WhatsApp channels carry a connection; they arrive with their adapters
  connection: null,
  approvalId: row.approvalId,
  requestedBy: row.requestedByUserId === null ? null : (users.get(row.requestedByUserId) ?? null),
  approvedBy: row.approvedByUserId === null ? null : (users.get(row.approvedByUserId) ?? null),
  lastErrorCode: row.lastErrorCode,
  lastActiveAt: row.lastActiveAt?.toISOString() ?? null,
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
})

/** The channels with the people who requested and approved them. */
export async function channelDtos(
  users: AgentChannelsDeps['users'],
  rows: readonly ChannelRow[],
): Promise<AgentChannelDto[]> {
  const ids = new Set<string>()
  for (const row of rows) {
    if (row.requestedByUserId !== null) ids.add(row.requestedByUserId)
    if (row.approvedByUserId !== null) ids.add(row.approvedByUserId)
  }
  const refs = ids.size === 0 ? new Map<string, UserRefDto>() : await users.findUserRefs([...ids])
  return rows.map((row) => channelDto(row, refs))
}

/**
 * The agents module's view of channels (database/agents-and-runs.md, §4): SurefyOS chat goes
 * active with the first publish, and an Admin or Owner can turn the API and widget channels on.
 * Slack and WhatsApp, and the approval a Builder's request needs, come with their adapters.
 */
export function createAgentChannels(deps: AgentChannelsDeps): AgentChannels {
  const dtos = (rows: readonly ChannelRow[]) => channelDtos(deps.users, rows)

  return {
    async list(tx, orgId, agentIds) {
      const rows = await deps.repository.listForAgents(tx, orgId, agentIds)
      const byAgent = new Map<string, AgentChannelDto[]>()
      const list = await dtos(rows)
      for (const dto of list) byAgent.set(dto.agentId, [...(byAgent.get(dto.agentId) ?? []), dto])
      return byAgent
    },

    async publish(tx, ctx, agent, request) {
      for (const channel of request.channels) {
        if (!isEnableable(channel)) throw channelNotAvailable('channels', channel.type)
        if (!request.external) throw channelNotAvailable('channels', channel.type)
      }
      await deps.repository.activate(tx, {
        orgId: ctx.orgId,
        agentId: agent.id,
        type: 'workspace_chat',
        config: { version: 1 },
        requestedByUserId: ctx.userId,
      })
      const widgetTokens: Record<string, string> = {}
      for (const channel of request.channels) {
        if (!isEnableable(channel)) continue
        const { row, token } = await enableChannel(deps.repository, tx, {
          orgId: ctx.orgId,
          agentId: agent.id,
          userId: ctx.userId,
          channel,
        })
        if (token !== null) widgetTokens[row.id] = token
      }
      const rows = await deps.repository.listForAgents(tx, ctx.orgId, [agent.id])
      return { channels: await dtos(rows), widgetTokens }
    },

    async disconnectAll(tx, ctx, agentId) {
      await deps.repository.disconnectAll(tx, ctx.orgId, agentId)
    },
  }
}

/** The channel requests this module can turn on today. */
export type EnableableChannel = Extract<AgentChannelRequest, { type: 'api' | 'widget' }>

export const isEnableable = (channel: AgentChannelRequest): channel is EnableableChannel =>
  channel.type === 'api' || channel.type === 'widget'

/** The stored config of a channel request: only the block of its own type. */
export const configOf = (channel: EnableableChannel): AgentChannelConfig =>
  channel.type === 'widget'
    ? { version: 1, widget: channel.config }
    : {
        version: 1,
        api: {
          rateLimitPerMinute:
            channel.config?.rateLimitPerMinute ?? API_CHANNEL_DEFAULT_RATE_PER_MINUTE,
        },
      }

/**
 * Turns an API or widget channel on (`active`). A widget channel that still has its token keeps
 * it, so a site that embeds it keeps working; a new or disconnected one gets a token, returned
 * once.
 */
export async function enableChannel(
  repository: AgentChannelsRepository,
  tx: DbExecutor,
  input: { orgId: string; agentId: string; userId: string | null; channel: EnableableChannel },
): Promise<{ row: ChannelRow; token: string | null }> {
  const { orgId, agentId, channel } = input
  const values = {
    orgId,
    agentId,
    type: channel.type,
    config: configOf(channel),
    requestedByUserId: input.userId,
  }
  if (channel.type !== 'widget') return { row: await repository.activate(tx, values), token: null }
  const existing = await repository.find(tx, orgId, agentId, 'widget')
  if (existing?.publicTokenHash != null && existing.publicTokenPrefix !== null) {
    // the row's CHECK sees the proposed row before the conflict: it carries the kept token
    const kept = { hash: existing.publicTokenHash, prefix: existing.publicTokenPrefix }
    return { row: await repository.activate(tx, { ...values, token: kept }), token: null }
  }
  const token = generateWidgetToken()
  const row = await repository.activate(tx, {
    ...values,
    token: { hash: token.hash, prefix: token.prefix },
  })
  return { row, token: token.secret }
}
