// SPDX-License-Identifier: AGPL-3.0-only
import { createHash } from 'node:crypto'

import { uuidv7 } from '@/lib/uuidv7.js'
import {
  KNOWLEDGE_ERROR_CODES,
  knowledgeConnectorConfigSchema,
  knowledgeLinkConfigSchema,
} from '@surefy/contracts'
import type { KnowledgeConnectorConfig, KnowledgeLinkConfig } from '@surefy/contracts'

import { parsedKeyOf, sourceKeyOf } from '../knowledge.keys.js'
import { crawl, LinkUnreachableError, nextSyncAfter } from './knowledgeCrawler.js'
import {
  connectorConfigOf,
  nextConnectorSyncAfter,
} from '../knowledgeConnectors/connectorConfig.js'
import {
  ConnectorExpiredError,
  ConnectorItemError,
  ConnectorUnavailableError,
  type ConnectorFile,
  type KnowledgeConnectorClient,
} from '../knowledgeConnectors/knowledgeConnectors.types.js'

import type { KnowledgeRepository } from '../knowledge.repository.js'
import type { KnowledgeConnections, KnowledgeFiles, KnowledgePeople } from '../knowledge.types.js'
import type { KnowledgeFailureCode } from './knowledgeIngestion.errors.js'
import type { KnowledgeIngestionRepository } from './knowledgeIngestion.repository.js'
import type { KnowledgeIngestionService } from './knowledgeIngestion.service.js'
import type { SafeGet } from './safeFetch.js'
import type { KnowledgeConnectorClients } from '../knowledgeConnectors/knowledgeConnectors.js'
import type {
  KnowledgeSourcePatch,
  KnowledgeSourceRow,
  KnowledgeSourcesRepository,
} from '../knowledgeSources/knowledgeSources.repository.js'
import type { Database } from '@/core/database/index.js'
import type { Logger } from '@/core/logger/index.js'

export interface KnowledgeSyncDeps {
  db: Database
  repository: KnowledgeRepository
  sources: KnowledgeSourcesRepository
  ingestion: KnowledgeIngestionRepository
  service: KnowledgeIngestionService
  files: KnowledgeFiles
  get: SafeGet
  connections: KnowledgeConnections
  people: KnowledgePeople
  clients: KnowledgeConnectorClients
  logger: Logger
  now?: () => Date
}

/** Due sources enqueued per scheduler run: the rest wait for the next one, five minutes later. */
const DUE_BATCH = 200

const sha256Of = (bytes: Buffer): string => createHash('sha256').update(bytes).digest('hex')

/** One remote item of a link or connector: a crawled page, a Drive file, a Notion page. */
interface SyncItem {
  /** The document's `external_ref`: the page address or the remote id. */
  ref: string
  title: string
  /** The bytes' SHA-256 or the remote revision: unchanged and ready means nothing to do. */
  hash: string
  /** The content, fetched only when the item changed; throws `SyncItemFailedError` for this item alone. */
  content(): Promise<{ bytes: Buffer; mimeType: string }>
}

/** This item could not be fetched: its document fails, the others go on. */
class SyncItemFailedError extends Error {
  constructor(readonly code: KnowledgeFailureCode) {
    super(code)
  }
}

/** A link or connector source taken for a sync, with its base and its parsed settings. */
interface SyncStart {
  source: KnowledgeSourceRow
  base: NonNullable<Awaited<ReturnType<KnowledgeRepository['findBase']>>>
  link: KnowledgeLinkConfig | null
  connector: KnowledgeConnectorConfig | null
}

/**
 * Link and connector sync (database/knowledge.md, Connector and link sync): list the remote items
 * (a crawl, or the connector folders through the connection), upsert one document per item on
 * (source, external ref), re-ingest what changed, and delete what is gone. A connector whose
 * sign-in expired is paused with its passages kept; Reconnect queues it again.
 */
export class KnowledgeSyncService {
  constructor(private readonly deps: KnowledgeSyncDeps) {}

  private now(): Date {
    return (this.deps.now ?? (() => new Date()))()
  }

  /** Enqueues `syncSource` for every due source, under the system scope (it only reads ids). */
  async scheduleDueSyncs(): Promise<number> {
    const due = await this.deps.db.system('knowledge-sync', (tx) =>
      this.deps.ingestion.dueSources(tx, this.now(), DUE_BATCH),
    )
    for (const item of due) await this.deps.service.enqueueSync(item.orgId, item.sourceId)
    return due.length
  }

  async syncSource(orgId: string, sourceId: string): Promise<void> {
    const start = await this.begin(orgId, sourceId)
    if (start === undefined) return
    if (start.link !== null) await this.syncLink(orgId, start, start.link)
    else if (start.connector !== null) await this.syncConnector(orgId, start, start.connector)
  }

  // ── Links ─────────────────────────────────────────────────────────────────────────────────────

  private async syncLink(
    orgId: string,
    start: SyncStart,
    link: KnowledgeLinkConfig,
  ): Promise<void> {
    const { source } = start
    let pages
    try {
      pages = await crawl(link, { get: this.deps.get })
    } catch (error) {
      if (!(error instanceof LinkUnreachableError)) throw error
      await this.failSource(
        orgId,
        start,
        KNOWLEDGE_ERROR_CODES.KNOWLEDGE_LINK_UNREACHABLE,
        nextSyncAfter(link.refresh, this.now()),
      )
      return
    }
    const firstTitle = pages[0]?.title
    await this.apply(
      orgId,
      start,
      pages.map((page) => ({
        ref: page.url,
        title: page.title ?? page.url,
        hash: sha256Of(page.bytes),
        content: () => Promise.resolve({ bytes: page.bytes, mimeType: page.mimeType }),
      })),
      {
        nextSyncAt: nextSyncAfter(link.refresh, this.now()),
        ...(firstTitle != null && source.name === new URL(link.url).hostname
          ? { name: firstTitle }
          : {}),
      },
    )
  }

  // ── Connectors ────────────────────────────────────────────────────────────────────────────────

  private async syncConnector(
    orgId: string,
    start: SyncStart,
    connector: KnowledgeConnectorConfig,
  ): Promise<void> {
    const { source } = start
    const connectionId = source.connectionId
    if (connectionId === null) return
    const client = this.deps.clients[connector.provider]
    const token = await this.openToken(orgId, source, connectionId)
    if (token === null) {
      await this.pause(orgId, start)
      return
    }
    let files: ConnectorFile[]
    try {
      files = await client.listFiles(token, connector.folders)
    } catch (error) {
      await this.connectorFailed(orgId, start, connector, connectionId, error)
      return
    }
    try {
      await this.apply(
        orgId,
        start,
        files.map((file) => this.connectorItem(client, token, file)),
        { nextSyncAt: nextConnectorSyncAfter(connector.syncEvery, this.now()) },
      )
    } catch (error) {
      await this.connectorFailed(orgId, start, connector, connectionId, error)
    }
  }

  private connectorItem(
    client: KnowledgeConnectorClient,
    token: string,
    file: ConnectorFile,
  ): SyncItem {
    return {
      ref: file.externalId,
      title: file.title,
      hash: file.revision,
      content: async () => {
        try {
          return await client.fetch(token, file)
        } catch (error) {
          // an expired sign-in stops the whole sync; anything else fails this file only
          if (error instanceof ConnectorExpiredError) throw error
          if (error instanceof ConnectorItemError || error instanceof ConnectorUnavailableError) {
            throw new SyncItemFailedError(KNOWLEDGE_ERROR_CODES.KNOWLEDGE_DOWNLOAD_FAILED)
          }
          throw error
        }
      },
    }
  }

  /**
   * The access token for this sync, with the rights of the person who added the source; null
   * when the connection cannot be used (expired, refused, disconnected, no longer theirs).
   */
  private async openToken(
    orgId: string,
    source: KnowledgeSourceRow,
    connectionId: string,
  ): Promise<string | null> {
    const member =
      source.addedByUserId === null
        ? null
        : await this.deps.people.forMember(orgId, source.addedByUserId)
    try {
      const opened = await this.deps.connections.open(
        orgId,
        { userId: member === null ? null : source.addedByUserId, teamIds: member?.teamIds ?? [] },
        connectionId,
      )
      return opened.secret.accessToken ?? null
    } catch (error) {
      this.deps.logger.info(
        { orgId, sourceId: source.id, connectionId, err: error },
        'connector connection not usable',
      )
      return null
    }
  }

  /** What stopped a connector sync: an expired sign-in pauses it, an outage fails it until the next sync. */
  private async connectorFailed(
    orgId: string,
    start: SyncStart,
    connector: KnowledgeConnectorConfig,
    connectionId: string,
    error: unknown,
  ): Promise<void> {
    if (error instanceof ConnectorExpiredError) {
      await this.deps.connections.markExpired(orgId, connectionId)
      await this.pause(orgId, start)
      return
    }
    if (error instanceof ConnectorUnavailableError || error instanceof ConnectorItemError) {
      this.deps.logger.warn(
        { orgId, sourceId: start.source.id, err: error },
        'connector sync failed',
      )
      await this.failSource(
        orgId,
        start,
        KNOWLEDGE_ERROR_CODES.KNOWLEDGE_DOWNLOAD_FAILED,
        nextConnectorSyncAfter(connector.syncEvery, this.now()),
      )
      return
    }
    throw error
  }

  /** `paused` with KNOWLEDGE_CONNECTION_EXPIRED and no next sync; the passages stay searchable. */
  private async pause(orgId: string, { source }: SyncStart): Promise<void> {
    await this.deps.db.tenant(orgId, async (tx) => {
      await this.deps.sources.updateSource(tx, orgId, source.id, {
        status: 'paused',
        errorCode: KNOWLEDGE_ERROR_CODES.KNOWLEDGE_CONNECTION_EXPIRED,
        nextSyncAt: null,
      })
    })
    this.deps.logger.info({ orgId, sourceId: source.id }, 'connector sync paused')
  }

  // ── Shared ────────────────────────────────────────────────────────────────────────────────────

  /** The source as `processing`, when it is an active link or connector of an active base. */
  private async begin(orgId: string, sourceId: string): Promise<SyncStart | undefined> {
    return this.deps.db.tenant(orgId, async (tx) => {
      const source = await this.deps.sources.findSourceById(tx, orgId, sourceId)
      if (source === undefined || source.type === 'file') return
      if (source.deletedAt !== null || source.status === 'paused') return
      const base = await this.deps.repository.findBase(tx, orgId, source.knowledgeBaseId)
      if (base?.deletedAt !== null) return
      const link = knowledgeLinkConfigSchema.safeParse(
        source.config !== null && 'link' in source.config ? source.config.link : undefined,
      )
      const connector = knowledgeConnectorConfigSchema.safeParse(connectorConfigOf(source))
      const config: Pick<SyncStart, 'link' | 'connector'> =
        source.type === 'link'
          ? { link: link.success ? link.data : null, connector: null }
          : { link: null, connector: connector.success ? connector.data : null }
      if (config.link === null && config.connector === null) return
      await this.deps.ingestion.setSource(tx, orgId, sourceId, {
        status: 'processing',
        errorCode: null,
      })
      return { source, base, ...config }
    })
  }

  private async failSource(
    orgId: string,
    { source, base }: SyncStart,
    code: KnowledgeFailureCode,
    nextSyncAt: Date | null,
  ): Promise<void> {
    const outcome = await this.deps.db.tenant(orgId, async (tx) => {
      await this.deps.sources.updateSource(tx, orgId, source.id, {
        lastSyncedAt: this.now(),
        nextSyncAt,
      })
      return this.deps.service.failSource(tx, orgId, { source, base }, code)
    })
    await this.deps.service.notify(orgId, outcome)
  }

  /**
   * Upserts one document per item: unchanged and ready items are skipped, changed or new ones are
   * fetched, stored and re-ingested, items that could not be fetched fail their document, and
   * documents whose item is gone are deleted with their passages and stored files.
   */
  private async apply(
    orgId: string,
    { source, base }: SyncStart,
    items: readonly SyncItem[],
    patch: KnowledgeSourcePatch,
  ): Promise<void> {
    const sourceId = source.id
    const existing = await this.deps.db.tenant(orgId, (tx) =>
      this.deps.sources.documentsOfSources(tx, orgId, [sourceId]),
    )
    const byRef = new Map(existing.map((doc) => [doc.externalRef, doc]))
    const seen = new Set(items.map((item) => item.ref))

    // objects first: a failed transaction leaves orphans that the source's purge removes by prefix
    const changes: {
      item: SyncItem
      id: string
      isNew: boolean
      sizeBytes: number
      mimeType: string
    }[] = []
    const failures: { item: SyncItem; id: string; isNew: boolean; code: KnowledgeFailureCode }[] =
      []
    for (const item of items) {
      const current = byRef.get(item.ref)
      if (current?.contentHash === item.hash && current.status === 'ready') continue
      const id = current?.id ?? uuidv7()
      try {
        const { bytes, mimeType } = await item.content()
        await this.deps.files.put(sourceKeyOf(orgId, id), bytes, mimeType)
        changes.push({ item, id, isNew: current === undefined, sizeBytes: bytes.length, mimeType })
      } catch (error) {
        if (!(error instanceof SyncItemFailedError)) throw error
        failures.push({ item, id, isNew: current === undefined, code: error.code })
      }
    }
    const removed = existing.filter((doc) => !seen.has(doc.externalRef))

    const outcome = await this.deps.db.tenant(orgId, async (tx) => {
      for (const { item, id, isNew, sizeBytes, mimeType } of changes) {
        const content = { contentHash: item.hash, sizeBytes, mimeType, title: item.title }
        if (isNew) {
          await this.deps.sources.insertDocument(tx, {
            id,
            organizationId: orgId,
            knowledgeBaseId: base.id,
            sourceId,
            externalRef: item.ref,
            objectKey: sourceKeyOf(orgId, id),
            status: 'pending',
            ...content,
          })
        } else {
          await this.deps.sources.updateDocumentContent(tx, orgId, id, content)
        }
      }
      for (const { item, id, isNew, code } of failures) {
        if (isNew) {
          await this.deps.sources.insertDocument(tx, {
            id,
            organizationId: orgId,
            knowledgeBaseId: base.id,
            sourceId,
            externalRef: item.ref,
            title: item.title,
            status: 'failed',
            errorCode: code,
          })
        } else {
          await this.deps.ingestion.setDocument(tx, orgId, id, {
            status: 'failed',
            errorCode: code,
          })
        }
      }
      await this.deps.sources.deleteDocuments(
        tx,
        orgId,
        removed.map((doc) => doc.id),
      )
      await this.deps.sources.updateSource(tx, orgId, sourceId, {
        lastSyncedAt: this.now(),
        ...patch,
      })
      // with changes the documents are open and the source stays processing; without, it is derived now
      return this.deps.service.finishSource(tx, orgId, { source, base })
    })
    await this.deps.service.enqueueDocuments(
      orgId,
      changes.map((change) => change.id),
    )
    for (const doc of removed) {
      for (const key of [sourceKeyOf(orgId, doc.id), parsedKeyOf(orgId, doc.id)]) {
        await this.deps.files.delete(key).catch((error: unknown) => {
          // the purge of the source removes what is left, by prefix
          this.deps.logger.warn({ err: error, orgId, key }, 'stored file not removed')
        })
      }
    }
    await this.deps.service.notify(orgId, outcome)
    this.deps.logger.info(
      {
        orgId,
        sourceId,
        type: source.type,
        items: items.length,
        changed: changes.length,
        failed: failures.length,
        removed: removed.length,
      },
      'source synced',
    )
  }
}
