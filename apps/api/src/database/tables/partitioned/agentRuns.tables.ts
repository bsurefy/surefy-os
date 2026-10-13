// SPDX-License-Identifier: AGPL-3.0-only
import {
  bigint,
  char,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  real,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core'

import type {
  AgentRunStepData,
  AgentRunStepStatus,
  AgentRunStepType,
  DataLocation,
  GuardOutcome,
} from '@surefy/contracts'

// The step trace of a run (database/agents-and-runs.md, §6), partitioned monthly on `created_at`
// and append-only. Typed queries only: the parent, its policy, checks, indexes and partitions are
// custom SQL, and drizzle.config.ts does not read this folder (conventions-and-security.md, §8).

const counter = () => bigint({ mode: 'number' }).notNull().default(0)

export const agentRunSteps = pgTable(
  'agent_run_steps',
  {
    id: uuid().notNull(),
    organizationId: uuid().notNull(),
    runId: uuid().notNull(),
    /** 1, 2, 3 … within the run. */
    seq: integer().notNull(),
    type: text().$type<AgentRunStepType>().notNull(),
    /** The tool, model or search the step shows. */
    name: text().notNull(),
    status: text().$type<AgentRunStepStatus>().notNull(),
    /** `AgentRunStepData` v1, capped at 64 KB. */
    input: jsonb().$type<AgentRunStepData>(),
    output: jsonb().$type<AgentRunStepData>(),
    modelKey: text(),
    inputTokens: counter(),
    outputTokens: counter(),
    costMicros: counter(),
    currency: char({ length: 3 }).notNull().default('USD'),
    confidence: real(),
    guardBand: text().$type<GuardOutcome>(),
    /** The approval the step created or resolved; no foreign key. */
    approvalId: uuid(),
    dataLocation: text().$type<DataLocation>(),
    errorCode: text(),
    startedAt: timestamp({ withTimezone: true }).notNull(),
    finishedAt: timestamp({ withTimezone: true }),
    durationMs: integer(),
    /** The partition key: equal to `started_at`, supplied by the executor so a retried insert is idempotent. */
    createdAt: timestamp({ withTimezone: true }).notNull(),
  },
  (t) => [primaryKey({ name: 'agent_run_steps_pkey', columns: [t.id, t.createdAt] })],
)
