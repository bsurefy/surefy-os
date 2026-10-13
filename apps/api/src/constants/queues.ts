// SPDX-License-Identifier: AGPL-3.0-only
/** BullMQ queue names (background-jobs.md, §1). The V2 queue (`flow-runs`) is added with its module. */
export const QUEUES = {
  KNOWLEDGE_INGESTION: 'knowledge-ingestion',
  AGENT_RUNS: 'agent-runs',
  EMAIL: 'email',
  USAGE: 'usage',
  DATA_CONTROL: 'data-control',
  OUTBOX: 'outbox',
  MAINTENANCE: 'maintenance',
} as const
export type QueueName = (typeof QUEUES)[keyof typeof QUEUES]
