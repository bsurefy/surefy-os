// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Actions the knowledge module writes to the audit log (`<area>.<verb>`, target type
 * `knowledge_base` or `knowledge_source`). Document text and questions never go into the metadata;
 * the Access tab's change history reads `knowledge_base.access_changed` entries.
 */
export const KNOWLEDGE_AUDIT_ACTIONS = {
  KNOWLEDGE_BASE_CREATED: 'knowledge_base.created',
  KNOWLEDGE_BASE_UPDATED: 'knowledge_base.updated',
  KNOWLEDGE_BASE_DELETED: 'knowledge_base.deleted',
  KNOWLEDGE_BASE_RESTORED: 'knowledge_base.restored',
  KNOWLEDGE_BASE_ACCESS_CHANGED: 'knowledge_base.access_changed',
  KNOWLEDGE_BASE_EMBEDDING_CHANGED: 'knowledge_base.embedding_changed',
  KNOWLEDGE_BASE_REINDEXED: 'knowledge_base.reindexed',
  KNOWLEDGE_SOURCE_ADDED: 'knowledge_source.added',
  KNOWLEDGE_SOURCE_REMOVED: 'knowledge_source.removed',
  KNOWLEDGE_SOURCE_RESTORED: 'knowledge_source.restored',
  KNOWLEDGE_SOURCE_RETRIED: 'knowledge_source.retried',
  KNOWLEDGE_SOURCE_SYNCED: 'knowledge_source.synced',
  KNOWLEDGE_SOURCE_DOWNLOADED: 'knowledge_source.downloaded',
} as const
export type KnowledgeAuditAction =
  (typeof KNOWLEDGE_AUDIT_ACTIONS)[keyof typeof KNOWLEDGE_AUDIT_ACTIONS]
