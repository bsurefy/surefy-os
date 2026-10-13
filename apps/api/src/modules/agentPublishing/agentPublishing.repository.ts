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

/** What the definer functions return for a widget token or an inbound account. */
export interface ResolvedChannel {
  orgId: string
  agentId: string
  channelId: string
  channelStatus: AgentChannelStatus
  agentStatus: AgentStatus
}

interface ResolvedRow extends Record<string, unknown> {
  organization_id: string
  agent_id: string
  channel_id: string
  channel_status: AgentChannelStatus
  agent_status: AgentStatus
}

const resolvedOf = (row: ResolvedRow): ResolvedChannel => ({
  orgId: row.organization_id,
  agentId: row.agent_id,
  channelId: row.channel_id,
  channelStatus: row.channel_status,
  agentStatus: row.agent_status,
})

/** The columns a channel route changes. */
export type ChannelChanges = Partial<
  Pick<
    ChannelRow,
    | 'status'
    | 'config'
    | 'publicTokenHash'
    | 'publicTokenPrefix'
    | 'lastErrorCode'
    | 'lastActiveAt'
    | 'approvalId'
    | 'approvedByUserId'
    | 'connectionId'
    | 'externalAccountId'
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
      token?: { hash: Buffer; prefix: string | null }
      /** `pending_approval` for a Builder's request; `active` by default. */
      status?: Extract<AgentChannelStatus, 'active' | 'pending_approval'>
    },
  ): Promise<ChannelRow> {
    const status = values.status ?? 'active'
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
        status,
        config: values.config,
        requestedByUserId: values.requestedByUserId,
        ...token,
      })
      .onConflictDoUpdate({
        target: [c.organizationId, c.agentId, c.type],
        targetWhere: sql`${c.type} in ('workspace_chat', 'api', 'widget')`,
        set: {
          status,
          config: values.config,
          requestedByUserId: values.requestedByUserId,
          approvalId: null,
          approvedByUserId: null,
          lastErrorCode: null,
          updatedAt: new Date(),
          ...token,
        },
      })
      .returning()
    if (row === undefined) throw new Error('channel upsert returned no row')
    return row
  }

  /** A Slack or WhatsApp channel: an agent may have several, each with its own account. */
  async insertExternal(
    tx: DbExecutor,
    values: {
      orgId: string
      agentId: string
      type: Extract<AgentChannelType, 'slack' | 'whatsapp'>
      status: Extract<AgentChannelStatus, 'active' | 'pending_approval'>
      config: AgentChannelConfig
      connectionId: string
      externalAccountId: string
      requestedByUserId: string | null
    },
  ): Promise<ChannelRow> {
    const [row] = await tx
      .insert(c)
      .values({
        organizationId: values.orgId,
        agentId: values.agentId,
        type: values.type,
        status: values.status,
        config: values.config,
        connectionId: values.connectionId,
        externalAccountId: values.externalAccountId.toLowerCase(),
        requestedByUserId: values.requestedByUserId,
      })
      .returning()
    if (row === undefined) throw new Error('channel insert returned no row')
    return row
  }

  /** Any channel of the organization by id (the approval of its publish names only the channel). */
  async findInOrg(
    tx: DbExecutor,
    orgId: string,
    channelId: string,
  ): Promise<ChannelRow | undefined> {
    const [row] = await tx
      .select()
      .from(c)
      .where(and(eq(c.organizationId, orgId), eq(c.id, channelId)))
      .limit(1)
    return row
  }

  /** The Slack and WhatsApp channels that send and receive through a connection. */
  async listByConnection(
    tx: DbExecutor,
    orgId: string,
    connectionId: string,
  ): Promise<ChannelRow[]> {
    return tx
      .select()
      .from(c)
      .where(
        and(
          eq(c.organizationId, orgId),
          eq(c.connectionId, connectionId),
          sql`${c.status} <> 'disconnected'`,
        ),
      )
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
  ): Promise<ResolvedChannel | undefined> {
    const result = await executor.execute<ResolvedRow>(
      sql`select organization_id, agent_id, channel_id, channel_status, agent_status from agent_channel_resolve_token(${tokenHash})`,
    )
    const row = result.rows[0]
    return row === undefined ? undefined : resolvedOf(row)
  }

  /** Definer `agent_channel_resolve_external`: the Slack or WhatsApp channel of an account. */
  async resolveExternal(
    executor: DbExecutor,
    type: Extract<AgentChannelType, 'slack' | 'whatsapp'>,
    account: string,
  ): Promise<ResolvedChannel | undefined> {
    const result = await executor.execute<ResolvedRow>(
      sql`select organization_id, agent_id, channel_id, channel_status, agent_status from agent_channel_resolve_external(${type}, ${account.toLowerCase()})`,
    )
    const row = result.rows[0]
    return row === undefined ? undefined : resolvedOf(row)
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
