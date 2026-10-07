// SPDX-License-Identifier: AGPL-3.0-only
import { createHash } from 'node:crypto'

import { uuidv7 } from '@/lib/uuidv7.js'
import { KNOWLEDGE_ERROR_CODES, knowledgeLinkConfigSchema } from '@surefy/contracts'

import { parsedKeyOf, sourceKeyOf } from '../knowledge.keys.js'
import { crawl, LinkUnreachableError, nextSyncAfter, type CrawledPage } from './knowledgeCrawler.js'

import type { KnowledgeRepository } from '../knowledge.repository.js'
import type { KnowledgeFiles } from '../knowledge.types.js'
import type { KnowledgeIngestionRepository } from './knowledgeIngestion.repository.js'
import type { KnowledgeIngestionService } from './knowledgeIngestion.service.js'
import type { SafeGet } from './safeFetch.js'
import type { KnowledgeSourcesRepository } from '../knowledgeSources/knowledgeSources.repository.js'
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
  logger: Logger
  now?: () => Date
}

/** Due sources enqueued per scheduler run: the rest wait for the next one, five minutes later. */
const DUE_BATCH = 200

const sha256Of = (bytes: Buffer): string => createHash('sha256').update(bytes).digest('hex')

/**
 * Link sync (database/knowledge.md, Connector and link sync): crawl the link, upsert one document
 * per page on (source, address), re-ingest what changed, and delete what is gone. Connector
 * sources (V1) use the same upsert with their own listing.
 */
export class KnowledgeSyncService {
  constructor(private readonly deps: KnowledgeSyncDeps) {}

  /** Enqueues `syncSource` for every due source, under the system scope (it only reads ids). */
  async scheduleDueSyncs(): Promise<number> {
    const due = await this.deps.db.system('knowledge-sync', (tx) =>
      this.deps.ingestion.dueSources(tx, (this.deps.now ?? (() => new Date()))(), DUE_BATCH),
    )
    for (const item of due) await this.deps.service.enqueueSync(item.orgId, item.sourceId)
    return due.length
  }

  async syncSource(orgId: string, sourceId: string): Promise<void> {
    const now = this.deps.now ?? (() => new Date())
    const start = await this.deps.db.tenant(orgId, async (tx) => {
      const source = await this.deps.sources.findSourceById(tx, orgId, sourceId)
      if (source?.type !== 'link' || source.deletedAt !== null || source.status === 'paused') {
        return
      }
      const base = await this.deps.repository.findBase(tx, orgId, source.knowledgeBaseId)
      const link = knowledgeLinkConfigSchema.safeParse(
        source.config !== null && 'link' in source.config ? source.config.link : undefined,
      )
      if (base?.deletedAt !== null || !link.success) return
      await this.deps.ingestion.setSource(tx, orgId, sourceId, {
        status: 'processing',
        errorCode: null,
      })
      return { source, base, link: link.data }
    })
    if (start === undefined) return
    const { source, base, link } = start

    let pages: CrawledPage[]
    try {
      pages = await crawl(link, { get: this.deps.get })
    } catch (error) {
      if (!(error instanceof LinkUnreachableError)) throw error
      const outcome = await this.deps.db.tenant(orgId, async (tx) => {
        await this.deps.sources.updateSource(tx, orgId, sourceId, {
          lastSyncedAt: now(),
          nextSyncAt: nextSyncAfter(link.refresh, now()),
        })
        return this.deps.service.failSource(
          tx,
          orgId,
          { source, base },
          KNOWLEDGE_ERROR_CODES.KNOWLEDGE_LINK_UNREACHABLE,
        )
      })
      await this.deps.service.notify(orgId, outcome)
      return
    }

    const existing = await this.deps.db.tenant(orgId, (tx) =>
      this.deps.sources.documentsOfSources(tx, orgId, [sourceId]),
    )
    const byRef = new Map(existing.map((doc) => [doc.externalRef, doc]))
    const seen = new Set(pages.map((page) => page.url))

    // objects first: a failed transaction leaves orphans that the source's purge removes by prefix
    const changes: {
      page: CrawledPage
      id: string
      hash: string
      isNew: boolean
    }[] = []
    for (const page of pages) {
      const hash = sha256Of(page.bytes)
      const current = byRef.get(page.url)
      if (current?.contentHash === hash && current.status === 'ready') continue
      const id = current?.id ?? uuidv7()
      await this.deps.files.put(sourceKeyOf(orgId, id), page.bytes, page.mimeType)
      changes.push({ page, id, hash, isNew: current === undefined })
    }
    const removed = existing.filter((doc) => !seen.has(doc.externalRef))

    const result = await this.deps.db.tenant(orgId, async (tx) => {
      for (const { page, id, hash, isNew } of changes) {
        const content = {
          contentHash: hash,
          sizeBytes: page.bytes.length,
          mimeType: page.mimeType,
          title: page.title ?? page.url,
        }
        if (isNew) {
          await this.deps.sources.insertDocument(tx, {
            id,
            organizationId: orgId,
            knowledgeBaseId: base.id,
            sourceId,
            externalRef: page.url,
            objectKey: sourceKeyOf(orgId, id),
            status: 'pending',
            ...content,
          })
        } else {
          await this.deps.sources.updateDocumentContent(tx, orgId, id, content)
        }
      }
      await this.deps.sources.deleteDocuments(
        tx,
        orgId,
        removed.map((doc) => doc.id),
      )
      const firstTitle = pages[0]?.title
      await this.deps.sources.updateSource(tx, orgId, sourceId, {
        lastSyncedAt: now(),
        nextSyncAt: nextSyncAfter(link.refresh, now()),
        ...(firstTitle != null && source.name === new URL(link.url).hostname
          ? { name: firstTitle }
          : {}),
      })
      // with changes the documents are open and the source stays processing; without, it is derived now
      return { outcome: await this.deps.service.finishSource(tx, orgId, { source, base }) }
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
    await this.deps.service.notify(orgId, result.outcome)
    this.deps.logger.info(
      { orgId, sourceId, pages: pages.length, changed: changes.length, removed: removed.length },
      'link synced',
    )
  }
}
