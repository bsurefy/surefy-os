// SPDX-License-Identifier: AGPL-3.0-only
import { sql } from 'drizzle-orm'
import {
  check,
  foreignKey,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'

import { AGENT_CHANNEL_STATUSES, AGENT_CHANNEL_TYPES } from '@surefy/contracts'
import type { AgentChannelConfig, AgentChannelStatus, AgentChannelType } from '@surefy/contracts'

import { agents } from './agents.tables.js'
import { approvals } from './approvals.tables.js'
import { users } from './auth.tables.js'
import { connections } from './connections.tables.js'
import { organizations } from './organizations.tables.js'
import { enumCheck } from '../checks.js'
import { id, orgId, timestamps } from '../columns.js'
import { bytea } from '../columnTypes.js'
import { tenantPolicy } from '../policies.js'

// Agent channels (database/agents-and-runs.md, §4): where a published agent answers. FORCE RLS and
// the definer functions that resolve inbound widget, Slack and WhatsApp traffic are in custom
// migrations. `agent_runs.channel_id` has no foreign key: a channel is disconnected, never deleted.

export const agentChannels = pgTable(
  'agent_channels',
  {
    id: id(),
    organizationId: orgId(organizations),
    agentId: uuid().notNull(),
    type: text().$type<AgentChannelType>().notNull(),
    status: text().$type<AgentChannelStatus>().notNull().default('pending_approval'),
    /** `AgentChannelConfig` v1. */
    config: jsonb().$type<AgentChannelConfig>().notNull().default({ version: 1 }),
    /** sha256 of the widget token; nulled when the channel is disconnected. */
    publicTokenHash: bytea(),
    publicTokenPrefix: text(),
    /** Routing key for inbound events: Slack `{team_id}/{bot_user_id}`, WhatsApp phone number id. Lowercase. */
    externalAccountId: text(),
    connectionId: uuid(),
    /** The `channel_publish` request while `pending_approval`. */
    approvalId: uuid().references(() => approvals.id, { onDelete: 'set null' }),
    requestedByUserId: uuid().references(() => users.id, { onDelete: 'set null' }),
    /** Null when an Admin published directly. */
    approvedByUserId: uuid().references(() => users.id, { onDelete: 'set null' }),
    lastErrorCode: text(),
    /** Written at most once a minute (buffered in Redis). */
    lastActiveAt: timestamp({ withTimezone: true }),
    ...timestamps(),
  },
  (t) => [
    unique('agent_channels_organization_id_id_key').on(t.organizationId, t.id),
    foreignKey({
      name: 'agent_channels_organization_id_agent_id_fkey',
      columns: [t.organizationId, t.agentId],
      foreignColumns: [agents.organizationId, agents.id],
    }).onDelete('cascade'),
    foreignKey({
      name: 'agent_channels_organization_id_connection_id_fkey',
      columns: [t.organizationId, t.connectionId],
      foreignColumns: [connections.organizationId, connections.id],
    }).onDelete('restrict'),
    enumCheck('agent_channels_type_check', t.type, AGENT_CHANNEL_TYPES),
    enumCheck('agent_channels_status_check', t.status, AGENT_CHANNEL_STATUSES),
    check(
      'agent_channels_widget_token_check',
      sql`${t.type} <> 'widget' or ${t.publicTokenHash} is not null or ${t.status} = 'disconnected'`,
    ),
    check(
      'agent_channels_external_check',
      sql`${t.type} not in ('slack', 'whatsapp') or ${t.status} = 'disconnected' or (${t.externalAccountId} is not null and ${t.connectionId} is not null)`,
    ),
    // at most one of each per agent
    uniqueIndex('agent_channels_agent_type_key')
      .on(t.organizationId, t.agentId, t.type)
      .where(sql`${t.type} in ('workspace_chat', 'api', 'widget')`),
    unique('agent_channels_public_token_hash_key').on(t.publicTokenHash),
    // global, so an inbound Slack or WhatsApp event resolves to exactly one channel
    uniqueIndex('agent_channels_external_account_key')
      .on(t.type, t.externalAccountId)
      .where(sql`${t.externalAccountId} is not null and ${t.status} <> 'disconnected'`),
    // Needs attention and approvals
    index('agent_channels_organization_id_status_idx')
      .on(t.organizationId, t.status)
      .where(sql`${t.status} in ('pending_approval', 'error')`),
    index('agent_channels_connection_id_idx')
      .on(t.organizationId, t.connectionId)
      .where(sql`${t.connectionId} is not null`),
    index('agent_channels_approval_id_idx')
      .on(t.approvalId)
      .where(sql`${t.approvalId} is not null`),
    index('agent_channels_requested_by_user_id_idx')
      .on(t.requestedByUserId)
      .where(sql`${t.requestedByUserId} is not null`),
    index('agent_channels_approved_by_user_id_idx')
      .on(t.approvedByUserId)
      .where(sql`${t.approvedByUserId} is not null`),
    tenantPolicy('agent_channels', t.organizationId),
  ],
)
