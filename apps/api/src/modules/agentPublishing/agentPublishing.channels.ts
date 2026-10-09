// SPDX-License-Identifier: AGPL-3.0-only
import { UnprocessableError } from '@/core/errors/index.js'
import { ERROR_CODES } from '@surefy/contracts'
import type { AgentChannelDto, AgentChannelRequest, UserRefDto } from '@surefy/contracts'

import { API_CHANNEL_DEFAULT_RATE_PER_MINUTE } from './agentPublishing.constants.js'

import type { AgentChannelsRepository, ChannelRow } from './agentPublishing.repository.js'
import type { AgentChannels } from '@/modules/agents/index.js'

export interface AgentChannelsDeps {
  repository: AgentChannelsRepository
  users: { findUserRefs(userIds: readonly string[]): Promise<ReadonlyMap<string, UserRefDto>> }
}

const channelDto = (row: ChannelRow, users: ReadonlyMap<string, UserRefDto>): AgentChannelDto => ({
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

const notAvailable = (type: string) =>
  new UnprocessableError(ERROR_CODES.VALIDATION_FAILED, 'This channel is not available', {
    details: [{ field: 'channels', reason: type }],
  })

/**
 * The agents module's view of channels (database/agents-and-runs.md, §4): SurefyOS chat goes
 * active with the first publish, and an Admin or Owner can turn the API channel on. The widget,
 * Slack and WhatsApp channels, and the approval a Builder's request needs, come with their adapters.
 */
export function createAgentChannels(deps: AgentChannelsDeps): AgentChannels {
  const dtos = async (rows: readonly ChannelRow[]): Promise<AgentChannelDto[]> => {
    const ids = new Set<string>()
    for (const row of rows) {
      if (row.requestedByUserId !== null) ids.add(row.requestedByUserId)
      if (row.approvedByUserId !== null) ids.add(row.approvedByUserId)
    }
    const users =
      ids.size === 0 ? new Map<string, UserRefDto>() : await deps.users.findUserRefs([...ids])
    return rows.map((row) => channelDto(row, users))
  }

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
        if (channel.type !== 'api') throw notAvailable(channel.type)
        if (!request.external) throw notAvailable(channel.type)
      }
      await deps.repository.activate(tx, {
        orgId: ctx.orgId,
        agentId: agent.id,
        type: 'workspace_chat',
        config: { version: 1 },
        requestedByUserId: ctx.userId,
      })
      for (const channel of request.channels) {
        await deps.repository.activate(tx, {
          orgId: ctx.orgId,
          agentId: agent.id,
          type: 'api',
          config: apiConfigOf(channel),
          requestedByUserId: ctx.userId,
        })
      }
      const rows = await deps.repository.listForAgents(tx, ctx.orgId, [agent.id])
      return { channels: await dtos(rows), widgetTokens: {} }
    },

    async disconnectAll(tx, ctx, agentId) {
      await deps.repository.disconnectAll(tx, ctx.orgId, agentId)
    },
  }
}

const apiConfigOf = (channel: AgentChannelRequest) => ({
  version: 1 as const,
  api: {
    rateLimitPerMinute:
      channel.type === 'api'
        ? (channel.config?.rateLimitPerMinute ?? API_CHANNEL_DEFAULT_RATE_PER_MINUTE)
        : API_CHANNEL_DEFAULT_RATE_PER_MINUTE,
  },
})
