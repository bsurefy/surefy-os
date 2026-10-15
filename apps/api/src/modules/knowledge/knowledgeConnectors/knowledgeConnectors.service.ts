// SPDX-License-Identifier: AGPL-3.0-only
import { AppError, ServiceUnavailableError } from '@/core/errors/index.js'
import { KNOWLEDGE_AUDIT_ACTIONS, knowledgeConnectorOf } from '@surefy/contracts'
import type {
  CreateKnowledgeConnectorSourceInput,
  KnowledgeConnectorItemsDto,
  KnowledgeConnectorProvider,
  KnowledgeSourceDto,
  ListKnowledgeConnectorItemsQuery,
} from '@surefy/contracts'

import {
  KnowledgeConnectionExpiredError,
  KnowledgeConnectionInvalidError,
  KnowledgeNoEmbeddingModelError,
} from '../knowledge.errors.js'
import { connectorConfigOf, defaultConnectorName } from './connectorConfig.js'
import {
  ConnectorExpiredError,
  ConnectorItemError,
  ConnectorUnavailableError,
} from './knowledgeConnectors.types.js'

import type { KnowledgeConnectorClients } from './knowledgeConnectors.js'
import type { KnowledgeRepository } from '../knowledge.repository.js'
import type {
  KnowledgeConnectionRef,
  KnowledgeConnections,
  KnowledgeContext,
  KnowledgeIngestionPort,
} from '../knowledge.types.js'
import type { KnowledgeAccessService } from '../knowledgeAccess.service.js'
import type {
  KnowledgeSourceRow,
  KnowledgeSourcesRepository,
} from '../knowledgeSources/knowledgeSources.repository.js'
import type { Database, DbExecutor } from '@/core/database/index.js'
import type { AuditRecorder } from '@/modules/audit/index.js'
import type { ConnectionPrincipal } from '@/modules/connections/index.js'

export interface KnowledgeConnectorsDeps {
  db: Database
  repository: KnowledgeRepository
  sources: KnowledgeSourcesRepository
  access: KnowledgeAccessService
  connections: KnowledgeConnections
  clients: KnowledgeConnectorClients
  ingestion: KnowledgeIngestionPort
  audit: AuditRecorder
  /** The Sources tab row of a source (the sources service). */
  present: (orgId: string, row: KnowledgeSourceRow) => Promise<KnowledgeSourceDto>
}

const principalOf = (ctx: KnowledgeContext): ConnectionPrincipal => ({
  userId: ctx.userId,
  teamIds: ctx.teamIds,
})

/**
 * Connector sources (contracts `knowledge/connectors.ts`): browse what a Google Drive or Notion
 * connection can see, and add a set of folders to a base. The sync itself is the ingestion
 * module's (`KnowledgeSyncService`). Everything needs Can manage on the base and a connection
 * the person may use.
 */
export class KnowledgeConnectorsService {
  constructor(private readonly deps: KnowledgeConnectorsDeps) {}

  async listItems(
    ctx: KnowledgeContext,
    baseId: string,
    query: ListKnowledgeConnectorItemsQuery,
  ): Promise<KnowledgeConnectorItemsDto> {
    const { provider, inBase } = await this.deps.db.tenant(ctx.orgId, async (tx) => {
      await this.deps.access.require(tx, ctx, baseId, 'manage')
      const found = await this.usableConnection(tx, ctx, query.connectionId)
      if (found.connection.status !== 'active') throw new KnowledgeConnectionExpiredError()
      const synced = await this.deps.sources.activeConnectorSourcesOfBase(tx, ctx.orgId, baseId)
      const ids = synced
        .filter((source) => source.connectionId === query.connectionId)
        .flatMap((source) => connectorConfigOf(source)?.folders ?? [])
        .map((folder) => folder.externalId)
      return { provider: found.provider, inBase: new Set(ids) }
    })
    const token = await this.openToken(ctx.orgId, principalOf(ctx), query.connectionId)
    try {
      const page = await this.deps.clients[provider].listItems(token, {
        parentId: query.parentId,
        q: query.q,
        limit: query.limit,
        cursor: query.cursor,
      })
      return {
        provider,
        items: page.items.map((item) => ({ ...item, inBase: inBase.has(item.externalId) })),
        nextCursor: page.nextCursor,
      }
    } catch (error) {
      if (error instanceof ConnectorExpiredError) {
        await this.deps.connections.markExpired(ctx.orgId, query.connectionId)
        throw new KnowledgeConnectionExpiredError()
      }
      // a folder that is gone or no longer shared has nothing to show
      if (error instanceof ConnectorItemError && error.status === 404) {
        return { provider, items: [], nextCursor: null }
      }
      if (error instanceof ConnectorUnavailableError || error instanceof ConnectorItemError) {
        throw new ServiceUnavailableError(undefined, 'The app did not answer; try again')
      }
      throw error
    }
  }

  /** `POST …/sources/connectors`: the `queued` source; its first sync starts at once. */
  async create(
    ctx: KnowledgeContext,
    baseId: string,
    input: CreateKnowledgeConnectorSourceInput,
  ): Promise<KnowledgeSourceDto> {
    const source = await this.deps.db.tenant(ctx.orgId, async (tx) => {
      const { base } = await this.deps.access.require(tx, ctx, baseId, 'manage')
      if (base.embeddingModelKey === null) throw new KnowledgeNoEmbeddingModelError()
      const { connection, provider } = await this.usableConnection(tx, ctx, input.connectionId)
      if (connection.status !== 'active') throw new KnowledgeConnectionInvalidError()
      const created = await this.deps.sources.insertSource(tx, {
        organizationId: ctx.orgId,
        knowledgeBaseId: baseId,
        type: 'connector',
        name: input.name ?? defaultConnectorName(input.folders),
        connectionId: connection.id,
        config: {
          version: 1,
          connector: { provider, folders: input.folders, syncEvery: input.syncEvery },
        },
        status: 'queued',
        addedByUserId: ctx.userId,
      })
      await this.deps.repository.recomputeCounters(tx, ctx.orgId, baseId)
      await this.deps.audit.record(tx, ctx, {
        action: KNOWLEDGE_AUDIT_ACTIONS.KNOWLEDGE_SOURCE_ADDED,
        target: { type: 'knowledge_source', id: created.id },
        metadata: {
          labels: { type: 'connector', provider, syncEvery: input.syncEvery },
          counts: { folders: input.folders.length },
          refs: { connectionId: connection.id },
        },
      })
      return created
    })
    await this.deps.ingestion.enqueueSync(ctx.orgId, source.id)
    return this.deps.present(ctx.orgId, source)
  }

  // ── Internals ─────────────────────────────────────────────────────────────────────────────────

  /** A Google Drive or Notion connection the person may use, whatever its status. */
  private async usableConnection(
    tx: DbExecutor,
    ctx: KnowledgeContext,
    connectionId: string,
  ): Promise<{ connection: KnowledgeConnectionRef; provider: KnowledgeConnectorProvider }> {
    let connection: KnowledgeConnectionRef
    try {
      connection = await this.deps.connections.assertUsable(
        tx,
        ctx.orgId,
        principalOf(ctx),
        connectionId,
      )
    } catch (error) {
      // gone, disconnected or not the person's to use: all the same to the dialog
      if (error instanceof AppError) throw new KnowledgeConnectionInvalidError()
      throw error
    }
    const provider = knowledgeConnectorOf(connection.providerKey)
    if (provider === null) throw new KnowledgeConnectionInvalidError()
    return { connection, provider }
  }

  /** The access token for one listing; a connection that cannot be opened needs Reconnect. */
  private async openToken(
    orgId: string,
    principal: ConnectionPrincipal,
    connectionId: string,
  ): Promise<string> {
    try {
      const opened = await this.deps.connections.open(orgId, principal, connectionId)
      const token = opened.secret.accessToken
      if (token === undefined) throw new KnowledgeConnectionExpiredError()
      return token
    } catch (error) {
      if (error instanceof AppError && !(error instanceof KnowledgeConnectionExpiredError)) {
        throw new KnowledgeConnectionExpiredError()
      }
      throw error
    }
  }
}
