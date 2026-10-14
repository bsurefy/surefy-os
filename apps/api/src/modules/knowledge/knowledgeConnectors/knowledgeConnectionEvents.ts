// SPDX-License-Identifier: AGPL-3.0-only
import { outboxHandler, type OutboxHandler } from '@/modules/outbox/index.js'
import {
  IMPACT_LISTED_MAX,
  KNOWLEDGE_AUDIT_ACTIONS,
  KNOWLEDGE_ERROR_CODES,
} from '@surefy/contracts'
import type { ConnectionImpactDto } from '@surefy/contracts'

import type { KnowledgeRepository } from '../knowledge.repository.js'
import type { KnowledgeIngestionPort } from '../knowledge.types.js'
import type { KnowledgeSourcesRepository } from '../knowledgeSources/knowledgeSources.repository.js'
import type { Database, DbExecutor } from '@/core/database/index.js'
import type { Logger } from '@/core/logger/index.js'
import type { AuditRecorder } from '@/modules/audit/index.js'
import type { ConnectionDependents } from '@/modules/connections/index.js'

export interface KnowledgeConnectionEventsDeps {
  db: Database
  repository: KnowledgeRepository
  sources: KnowledgeSourcesRepository
  ingestion: KnowledgeIngestionPort
  audit: AuditRecorder
  logger: Logger
}

/**
 * What happens to connector sources when their connection changes (database/knowledge.md §3):
 * `connection.expired` pauses them (their passages stay searchable), `connection.reconnected`
 * queues the paused ones and syncs them, `connection.revoked` moves them to Recently deleted.
 * Each handler only moves sources that are not there yet, so a second delivery changes nothing.
 */
export class KnowledgeConnectionEvents {
  constructor(private readonly deps: KnowledgeConnectionEventsDeps) {}

  async onExpired(orgId: string, connectionId: string): Promise<void> {
    const paused = await this.deps.db.tenant(orgId, async (tx) => {
      let count = 0
      for (const source of await this.deps.sources.activeSourcesOfConnection(
        tx,
        orgId,
        connectionId,
      )) {
        if (source.status === 'paused') continue
        await this.deps.sources.updateSource(tx, orgId, source.id, {
          status: 'paused',
          errorCode: KNOWLEDGE_ERROR_CODES.KNOWLEDGE_CONNECTION_EXPIRED,
          nextSyncAt: null,
        })
        count += 1
      }
      return count
    })
    if (paused > 0)
      this.deps.logger.info({ orgId, connectionId, paused }, 'connector sources paused')
  }

  async onReconnected(orgId: string, connectionId: string): Promise<void> {
    const queued = await this.deps.db.tenant(orgId, async (tx) => {
      const ids: string[] = []
      for (const source of await this.deps.sources.activeSourcesOfConnection(
        tx,
        orgId,
        connectionId,
      )) {
        if (source.status !== 'paused') continue
        await this.deps.sources.updateSource(tx, orgId, source.id, {
          status: 'queued',
          errorCode: null,
          progressPercent: 0,
        })
        ids.push(source.id)
      }
      return ids
    })
    for (const sourceId of queued) await this.deps.ingestion.enqueueSync(orgId, sourceId)
    if (queued.length > 0) {
      this.deps.logger.info(
        { orgId, connectionId, queued: queued.length },
        'connector sources resumed',
      )
    }
  }

  async onRevoked(orgId: string, connectionId: string): Promise<void> {
    const ctx = { orgId, userId: null, via: 'system' as const, requestId: 'connection-revoked' }
    const removed = await this.deps.db.tenant(orgId, async (tx) => {
      const sources = await this.deps.sources.activeSourcesOfConnection(tx, orgId, connectionId)
      for (const source of sources) {
        await this.deps.sources.softDeleteSource(tx, orgId, source.id, null)
        await this.deps.audit.record(tx, ctx, {
          action: KNOWLEDGE_AUDIT_ACTIONS.KNOWLEDGE_SOURCE_REMOVED,
          target: { type: 'knowledge_source', id: source.id },
          metadata: { labels: { reason: 'connection_revoked' } },
        })
      }
      for (const baseId of new Set(sources.map((source) => source.knowledgeBaseId))) {
        await this.deps.repository.recomputeCounters(tx, orgId, baseId)
      }
      return sources.length
    })
    if (removed > 0)
      this.deps.logger.info({ orgId, connectionId, removed }, 'connector sources removed')
  }

  handlers(): OutboxHandler[] {
    return [
      outboxHandler('connection.expired', 'knowledge.pause-connector-sources', (delivery) =>
        delivery.orgId === null
          ? Promise.resolve()
          : this.onExpired(delivery.orgId, delivery.payload.id),
      ),
      outboxHandler('connection.reconnected', 'knowledge.resume-connector-sources', (delivery) =>
        delivery.orgId === null
          ? Promise.resolve()
          : this.onReconnected(delivery.orgId, delivery.payload.id),
      ),
      outboxHandler('connection.revoked', 'knowledge.remove-connector-sources', (delivery) =>
        delivery.orgId === null
          ? Promise.resolve()
          : this.onRevoked(delivery.orgId, delivery.payload.id),
      ),
    ]
  }

  /** Connector sources as a connection's dependents: its "used by" count and Disconnect dialog. */
  dependents(): ConnectionDependents {
    return {
      counts: (tx: DbExecutor, orgId: string, connectionIds: readonly string[]) =>
        this.deps.sources.countByConnections(tx, orgId, connectionIds),
      impact: async (tx: DbExecutor, orgId: string, connectionId: string) => {
        const sources = await this.deps.sources.activeSourcesOfConnection(tx, orgId, connectionId)
        const impact: ConnectionImpactDto = {
          dependents:
            sources.length === 0 ? [] : [{ type: 'knowledge_source', count: sources.length }],
          listed: sources.slice(0, IMPACT_LISTED_MAX).map((source) => ({
            type: 'knowledge_source',
            id: source.id,
            name: source.name,
          })),
        }
        return impact
      },
    }
  }
}
