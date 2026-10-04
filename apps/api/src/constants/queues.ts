// SPDX-License-Identifier: AGPL-3.0-only
/** BullMQ queue names (background-jobs.md, §1). V1/V2 queues (`agent-runs`, `flow-runs`) are added with their modules. */
export const QUEUES = {
  KNOWLEDGE_INGESTION: 'knowledge-ingestion',
  EMAIL: 'email',
  USAGE: 'usage',
  DATA_CONTROL: 'data-control',
  OUTBOX: 'outbox',
  MAINTENANCE: 'maintenance',
} as const
export type QueueName = (typeof QUEUES)[keyof typeof QUEUES]
