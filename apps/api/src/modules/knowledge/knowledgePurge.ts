// SPDX-License-Identifier: AGPL-3.0-only
import { outboxHandler, type OutboxDelivery, type OutboxHandler } from '@/modules/outbox/index.js'

import { parsedKeyOf, sourceKeyOf } from './knowledge.keys.js'

import type { KnowledgeFiles } from './knowledge.types.js'

/**
 * `knowledge_base.purged` and `knowledge_source.purged`: `purge_soft_deleted` deleted the rows
 * (documents and chunks cascade) and listed the documents first; this removes their stored file
 * and parse output. Deleting a missing object is harmless, so a second delivery is too.
 */
export function createKnowledgePurgeHandlers(files: KnowledgeFiles): OutboxHandler[] {
  const deleteDocuments = async ({
    orgId,
    payload,
  }: OutboxDelivery<'knowledge_base.purged' | 'knowledge_source.purged'>) => {
    if (orgId === null) return
    for (const documentId of payload.documentIds) {
      await files.delete(sourceKeyOf(orgId, documentId))
      await files.delete(parsedKeyOf(orgId, documentId))
    }
  }
  return [
    outboxHandler('knowledge_base.purged', 'deleteKnowledgeObjects', deleteDocuments),
    outboxHandler('knowledge_source.purged', 'deleteKnowledgeObjects', deleteDocuments),
  ]
}
