// SPDX-License-Identifier: AGPL-3.0-only
import { and, asc, eq, inArray, sql } from 'drizzle-orm'

import { agentChannels } from '@/database/tables/index.js'
import type {
  AgentChannelConfig,
  AgentChannelStatus,
  AgentChannelType,
  AgentStatus,
} from '@surefy/contracts'

import type { DbExecutor } from '@/core/database/index.js'

export type ChannelRow = typeof agentChannels.$inferSelect

/** What `agent_channel_resolve_token` returns for a widget token. */
export interface ResolvedWidgetToken {
  orgId: string
  agentId: string
  channelId: string
  channelStatus: AgentChannelStatus
  agentStatus: AgentStatus
}

/** The columns a channel route changes. */
export type ChannelChanges = Partial<
  Pick<
    ChannelRow,
    'status' | 'config' | 'publicTokenHash' | 'publicTokenPrefix' | 'lastErrorCode' | 'lastActiveAt'
  >
>

const c = agentChannels

/** Rows of `agent_channels` (tenant transaction). */
export class AgentChannelsRepository {
  async listForAgents(
    tx: DbExecutor,
    orgId: string,
    agentIds: readonly string[],
  ): Promise<ChannelRow[]> {
    if (agentIds.length === 0) return []
    return tx
      .select()
      .from(c)
      .where(and(eq(c.organizationId, orgId), inArray(c.agentId, [...agentIds])))
      .orderBy(asc(c.createdAt), asc(c.id))
  }

  async find(
    tx: DbExecutor,
    orgId: string,
    agentId: string,
    type: AgentChannelType,
  ): Promise<ChannelRow | undefined> {
    const [row] = await tx
      .select()
      .from(c)
      .where(and(eq(c.organizationId, orgId), eq(c.agentId, agentId), eq(c.type, type)))
      .limit(1)
    return row
  }

  async findById(
    tx: DbExecutor,
    orgId: string,
    agentId: string,
    channelId: string,
  ): Promise<ChannelRow | undefined> {
    const [row] = await tx
      .select()
      .from(c)
      .where(and(eq(c.organizationId, orgId), eq(c.agentId, agentId), eq(c.id, channelId)))
      .limit(1)
    return row
  }

  /**
   * The channel goes `active` with the config; an existing channel of the type (paused or
   * disconnected earlier) is reused, so an agent never has two. A widget channel's token is
   * replaced only when one is given.
   */
  async activate(
    tx: DbExecutor,
    values: {
      orgId: string
      agentId: string
      /** One of the types an agent has at most one of (the partial unique index). */
      type: Extract<AgentChannelType, 'workspace_chat' | 'api' | 'widget'>
      config: AgentChannelConfig
      requestedByUserId: string | null
      token?: { hash: Buffer; prefix: string }
    },
  ): Promise<ChannelRow> {
    const token =
      values.token === undefined
        ? {}
        : { publicTokenHash: values.token.hash, publicTokenPrefix: values.token.prefix }
    const [row] = await tx
      .insert(c)
      .values({
        organizationId: values.orgId,
        agentId: values.agentId,
        type: values.type,
        status: 'active',
        config: values.config,
        requestedByUserId: values.requestedByUserId,
        ...token,
      })
      .onConflictDoUpdate({
        target: [c.organizationId, c.agentId, c.type],
        targetWhere: sql`${c.type} in ('workspace_chat', 'api', 'widget')`,
        set: {
          status: 'active',
          config: values.config,
          lastErrorCode: null,
          updatedAt: new Date(),
          ...token,
        },
      })
      .returning()
    if (row === undefined) throw new Error('channel upsert returned no row')
    return row
  }

  async update(
    tx: DbExecutor,
    orgId: string,
    channelId: string,
    changes: ChannelChanges,
  ): Promise<ChannelRow> {
    const [row] = await tx
      .update(c)
      .set({ ...changes, updatedAt: new Date() })
      .where(and(eq(c.organizationId, orgId), eq(c.id, channelId)))
      .returning()
    if (row === undefined) throw new Error('channel update returned no row')
    return row
  }

  /** `last_active_at`, never backwards. */
  async touch(tx: DbExecutor, orgId: string, channelId: string, at: Date): Promise<void> {
    await tx
      .update(c)
      .set({ lastActiveAt: at })
      .where(
        and(
          eq(c.organizationId, orgId),
          eq(c.id, channelId),
          sql`(${c.lastActiveAt} is null or ${c.lastActiveAt} < ${at.toISOString()}::timestamptz)`,
        ),
      )
  }

  /** Definer `agent_channel_resolve_token`: a widget channel of an active organization. */
  async resolveToken(
    executor: DbExecutor,
    tokenHash: Buffer,
  ): Promise<ResolvedWidgetToken | undefined> {
    const result = await executor.execute<{
      organization_id: string
      agent_id: string
      channel_id: string
      channel_status: AgentChannelStatus
      agent_status: AgentStatus
    }>(
      sql`select organization_id, agent_id, channel_id, channel_status, agent_status from agent_channel_resolve_token(${tokenHash})`,
    )
    const row = result.rows[0]
    if (row === undefined) return
    return {
      orgId: row.organization_id,
      agentId: row.agent_id,
      channelId: row.channel_id,
      channelStatus: row.channel_status,
      agentStatus: row.agent_status,
    }
  }

  /** Every channel of the agent goes `disconnected` and its widget token stops resolving. */
  async disconnectAll(tx: DbExecutor, orgId: string, agentId: string): Promise<void> {
    await tx
      .update(c)
      .set({
        status: 'disconnected',
        publicTokenHash: null,
        publicTokenPrefix: null,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(c.organizationId, orgId),
          eq(c.agentId, agentId),
          sql`${c.status} <> 'disconnected'`,
        ),
      )
  }
}
