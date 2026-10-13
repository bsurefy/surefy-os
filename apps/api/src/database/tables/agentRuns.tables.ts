// SPDX-License-Identifier: AGPL-3.0-only
import { sql } from 'drizzle-orm'
import {
  bigint,
  boolean,
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  real,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core'

import { AGENT_RUN_STATUSES, AGENT_RUN_TRIGGERS } from '@surefy/contracts'
import type { AgentRunStatus, AgentRunSummary, AgentRunTrigger } from '@surefy/contracts'

import { agents, agentVersions } from './agents.tables.js'
import { apiKeys } from './apiKeys.tables.js'
import { users } from './auth.tables.js'
import { chats } from './chat.tables.js'
import { organizations } from './organizations.tables.js'
import { enumCheck } from '../checks.js'
import { currency, id, orgId } from '../columns.js'
import { tenantPolicy } from '../policies.js'

// Agent runs (database/agents-and-runs.md, §5): one execution of an agent. FORCE RLS is in the
// security migration, which also creates `agent_run_steps` (a monthly partitioned, append-only
// table: typed queries in `partitioned/agentRuns.tables.ts`). `channel_id` and `flow_run_id` are
// plain uuid columns until `agent_channels` and `flow_runs` exist (their foreign keys, `set
// null`, join with those tables).

const counter = () => bigint({ mode: 'number' }).notNull().default(0)

export const agentRuns = pgTable(
  'agent_runs',
  {
    id: id(),
    organizationId: orgId(organizations),
    agentId: uuid().notNull(),
    /** Null for test runs of the draft. */
    agentVersionId: uuid(),
    trigger: text().$type<AgentRunTrigger>().notNull(),
    isTest: boolean().notNull().default(false),
    status: text().$type<AgentRunStatus>().notNull().default('queued'),
    /** Null for API, widget, Slack, WhatsApp and flow runs. */
    startedByUserId: uuid().references(() => users.id, { onDelete: 'set null' }),
    /** The primary team of the starter when the run started: a snapshot, no foreign key. */
    teamId: uuid(),
    apiKeyId: uuid().references(() => apiKeys.id, { onDelete: 'set null' }),
    /** V1: → agent_channels.id (set null). */
    channelId: uuid(),
    chatId: uuid().references(() => chats.id, { onDelete: 'set null' }),
    /** V2: → flow_runs.id (set null). */
    flowRunId: uuid(),
    /** The main model used, after routing and fallback. */
    modelKey: text(),
    inputTokens: counter(),
    outputTokens: counter(),
    costMicros: counter(),
    ...currency(),
    /** The lowest decision confidence (0 to 1) in the run. */
    minConfidence: real(),
    /** At least one approval was required. */
    neededHuman: boolean().notNull().default(false),
    /** An approver edited or rejected an action, or a person corrected the answer. */
    humanCorrected: boolean().notNull().default(false),
    stepCount: integer().notNull().default(0),
    /** An API error code on `failed` and `timed_out`. */
    errorCode: text(),
    /** `AgentRunSummary` v1, written when the run ends. */
    summary: jsonb().$type<AgentRunSummary>(),
    startedAt: timestamp({ withTimezone: true }),
    finishedAt: timestamp({ withTimezone: true }),
    durationMs: integer(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    /** Doubles as the worker's heartbeat while the run is `running`. */
    updatedAt: timestamp({ withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    unique('agent_runs_organization_id_id_key').on(t.organizationId, t.id), // target of agent_run_steps
    foreignKey({
      name: 'agent_runs_organization_id_agent_id_fkey',
      columns: [t.organizationId, t.agentId],
      foreignColumns: [agents.organizationId, agents.id],
    }).onDelete('cascade'),
    foreignKey({
      name: 'agent_runs_organization_id_agent_id_agent_version_id_fkey',
      columns: [t.organizationId, t.agentId, t.agentVersionId],
      foreignColumns: [agentVersions.organizationId, agentVersions.agentId, agentVersions.id],
    }),
    enumCheck('agent_runs_trigger_check', t.trigger, AGENT_RUN_TRIGGERS),
    enumCheck('agent_runs_status_check', t.status, AGENT_RUN_STATUSES),
    check('agent_runs_test_check', sql`${t.isTest} = (${t.trigger} = 'test')`),
    check(
      'agent_runs_finished_check',
      sql`${t.status} not in ('succeeded', 'failed', 'canceled', 'timed_out') or ${t.finishedAt} is not null`,
    ),
    check(
      'agent_runs_counts_check',
      sql`${t.inputTokens} >= 0 and ${t.outputTokens} >= 0 and ${t.costMicros} >= 0 and ${t.stepCount} >= 0`,
    ),
    check('agent_runs_min_confidence_check', sql`${t.minConfidence} between 0 and 1`),
    // Insights › Runs, keyset pagination
    index('agent_runs_organization_id_created_at_id_idx').on(
      t.organizationId,
      t.createdAt.desc(),
      t.id.desc(),
    ),
    // an agent's Runs tab, last run, last 5 runs
    index('agent_runs_organization_id_agent_id_created_at_idx').on(
      t.organizationId,
      t.agentId,
      t.createdAt.desc(),
    ),
    // the person filter
    index('agent_runs_organization_id_started_by_user_id_idx')
      .on(t.organizationId, t.startedByUserId, t.createdAt.desc())
      .where(sql`${t.startedByUserId} is not null`),
    // the run stats rollup window
    index('agent_runs_organization_id_finished_at_idx')
      .on(t.organizationId, t.finishedAt)
      .where(sql`${t.finishedAt} is not null and ${t.isTest} = false`),
    // the stuck-run and timeout sweeper (system scope)
    index('agent_runs_open_idx')
      .on(t.status, t.updatedAt)
      .where(sql`${t.status} in ('queued', 'running', 'waiting_approval')`),
    index('agent_runs_agent_version_idx')
      .on(t.organizationId, t.agentId, t.agentVersionId)
      .where(sql`${t.agentVersionId} is not null`),
    index('agent_runs_chat_id_idx')
      .on(t.chatId)
      .where(sql`${t.chatId} is not null`),
    index('agent_runs_flow_run_id_idx')
      .on(t.flowRunId)
      .where(sql`${t.flowRunId} is not null`),
    index('agent_runs_channel_id_idx')
      .on(t.channelId)
      .where(sql`${t.channelId} is not null`),
    index('agent_runs_api_key_id_idx')
      .on(t.apiKeyId)
      .where(sql`${t.apiKeyId} is not null`),
    index('agent_runs_started_by_user_id_idx')
      .on(t.startedByUserId)
      .where(sql`${t.startedByUserId} is not null`),
    tenantPolicy('agent_runs', t.organizationId),
  ],
)
