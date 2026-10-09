// SPDX-License-Identifier: AGPL-3.0-only
import { and, asc, eq, inArray, sql } from 'drizzle-orm'

import { agentChannels } from '@/database/tables/index.js'
import type { AgentChannelConfig, AgentChannelType } from '@surefy/contracts'

import type { DbExecutor } from '@/core/database/index.js'

export type ChannelRow = typeof agentChannels.$inferSelect

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

  /**
   * The channel goes `active` with the config; an existing channel of the type (paused or
   * disconnected earlier) is reused, so an agent never has two.
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
    },
  ): Promise<ChannelRow> {
    const [row] = await tx
      .insert(c)
      .values({
        organizationId: values.orgId,
        agentId: values.agentId,
        type: values.type,
        status: 'active',
        config: values.config,
        requestedByUserId: values.requestedByUserId,
      })
      .onConflictDoUpdate({
        target: [c.organizationId, c.agentId, c.type],
        targetWhere: sql`${c.type} in ('workspace_chat', 'api', 'widget')`,
        set: {
          status: 'active',
          config: values.config,
          lastErrorCode: null,
          updatedAt: new Date(),
        },
      })
      .returning()
    if (row === undefined) throw new Error('channel upsert returned no row')
    return row
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
