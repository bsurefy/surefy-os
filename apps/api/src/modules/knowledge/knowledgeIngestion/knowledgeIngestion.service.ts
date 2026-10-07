// SPDX-License-Identifier: AGPL-3.0-only
import type { KnowledgeSourceStatus } from '@surefy/contracts'

import {
  CHUNKING_PRESETS,
  EMBED_BATCH_SIZE,
  PARSE_PROGRESS_PERCENT,
} from '../knowledge.constants.js'
import { parsedKeyOf } from '../knowledge.keys.js'
import { chunkDocument, embeddingInput, type Chunk } from './knowledgeChunker.js'
import { KnowledgeNoTextError, type KnowledgeFailureCode } from './knowledgeIngestion.errors.js'
import { isActiveTarget } from './knowledgeIngestion.repository.js'

import type { KnowledgeRepository } from '../knowledge.repository.js'
import type {
  KnowledgeFiles,
  KnowledgeGateway,
  KnowledgeIngestionPort,
  KnowledgeMemberships,
} from '../knowledge.types.js'
import type { KnowledgeJobs } from './knowledgeIngestion.jobs.js'
import type { IngestTarget, KnowledgeIngestionRepository } from './knowledgeIngestion.repository.js'
import type { Database, DbExecutor } from '@/core/database/index.js'
import type { Logger } from '@/core/logger/index.js'
import type { Queues } from '@/core/queue/index.js'
import type { MlService, ParsedDocument } from '@/integrations/ml/index.js'
import type { ModelCallContext } from '@/modules/modelGateway/index.js'
import type { NotifyInput } from '@/modules/notifications/notifications.types.js'

export interface KnowledgeIngestionDeps {
  db: Database
  repository: KnowledgeRepository
  ingestion: KnowledgeIngestionRepository
  ml: MlService
  files: KnowledgeFiles
  gateway: Pick<KnowledgeGateway, 'embedMany'>
  memberships: KnowledgeMemberships
  notifications: { notify(ctx: { orgId: string }, input: NotifyInput): Promise<unknown> }
  queues: Pick<Queues, 'enqueue'>
  /** The job definitions, read when a job is enqueued (they are built after this service). */
  jobs: () => KnowledgeJobs
  logger: Logger
}

const URL_EXPIRES_SECONDS = 15 * 60

const NOTIFIED: Partial<
  Record<KnowledgeSourceStatus, 'knowledge_source.ready' | 'knowledge_source.failed'>
> = {
  ready: 'knowledge_source.ready',
  failed: 'knowledge_source.failed',
  partially_failed: 'knowledge_source.failed',
}

/** What a finished source tells the person who added it. */
export interface SourceOutcome {
  sourceId: string
  sourceName: string
  baseName: string
  status: KnowledgeSourceStatus
  addedByUserId: string | null
  failed: number
  stamp: string
}

/**
 * The ingestion pipeline (database/knowledge.md, Ingestion status flow): parse through the ML
 * service, chunk in Node, embed through the model gateway (metered), store passages and vectors,
 * and derive the source's status when no document of it is open. Also the queue side of the
 * services: what they enqueue after their transaction commits.
 */
export class KnowledgeIngestionService implements KnowledgeIngestionPort {
  constructor(private readonly deps: KnowledgeIngestionDeps) {}

  // ── The port the services use ─────────────────────────────────────────────────────────────────

  resetDocumentsInTx(
    tx: DbExecutor,
    orgId: string,
    baseId: string,
    sourceIds?: readonly string[],
  ): Promise<string[]> {
    return this.deps.ingestion.resetDocuments(tx, orgId, baseId, sourceIds)
  }

  async retryDocumentsInTx(
    tx: DbExecutor,
    orgId: string,
    baseId: string,
    sourceId: string,
    withOcr: boolean,
  ): Promise<string[]> {
    if (withOcr) await this.deps.ingestion.setOcrMode(tx, orgId, sourceId, 'force')
    return this.deps.ingestion.resetDocuments(tx, orgId, baseId, [sourceId], ['failed'])
  }

  deleteChunksOfModelInTx(
    tx: DbExecutor,
    orgId: string,
    baseId: string,
    modelKey: string,
  ): Promise<void> {
    return this.deps.ingestion.deleteChunksOfModel(tx, orgId, baseId, modelKey)
  }

  async enqueueDocuments(orgId: string, documentIds: readonly string[]): Promise<void> {
    for (const documentId of documentIds) {
      // the state machine (`pending → parsing`) keeps two jobs from running one document, so the
      // id only needs to be unique per run: a kept completed or failed job must not block a retry
      await this.deps.queues.enqueue(
        this.deps.jobs().ingestDocument,
        { orgId, documentId },
        { jobId: `ingest-${documentId}-${Date.now().toString(36)}` },
      )
    }
  }

  async enqueueReembed(orgId: string, baseId: string): Promise<void> {
    await this.deps.queues.enqueue(
      this.deps.jobs().reembedBase,
      { orgId, baseId },
      { jobId: `reembed-${baseId}-${Date.now().toString(36)}` },
    )
  }

  async enqueueSync(orgId: string, sourceId: string): Promise<void> {
    await this.deps.queues.enqueue(
      this.deps.jobs().syncSource,
      { orgId, sourceId },
      { jobId: `sync-${sourceId}-${Date.now().toString(36)}` },
    )
  }

  // ── ingestDocument ────────────────────────────────────────────────────────────────────────────

  /**
   * Processes one document. Returns when it is `ready`, or when there is nothing to do (the
   * document, its source or its base is gone or deleted, or another job has it). Throws what a
   * retry may fix; the job decides, from the failure, whether to retry or fail the document.
   */
  async ingestDocument(
    orgId: string,
    documentId: string,
    options: { resume: boolean; signal?: AbortSignal },
  ): Promise<void> {
    const target = await this.claim(orgId, documentId, options.resume)
    if (target === undefined) return
    const { source, base } = target

    const parsed = await this.parse(orgId, target, options.signal)
    const chunks = chunkDocument(parsed, CHUNKING_PRESETS[base.chunkingPreset])
    if (chunks.length === 0) throw new KnowledgeNoTextError()
    await this.deps.db.tenant(orgId, async (tx) => {
      await this.deps.ingestion.setDocument(tx, orgId, documentId, {
        status: 'embedding',
        pageCount: parsed.pages > 0 ? parsed.pages : null,
        parsedObjectKey: parsedKeyOf(orgId, documentId),
        // a crawled page is named by what it says; a file keeps its name
        ...(source.type === 'link' && parsed.title !== null && parsed.title.trim() !== ''
          ? { title: parsed.title.trim().slice(0, 300) }
          : {}),
      })
      if (source.type === 'file') {
        await this.deps.ingestion.setSource(tx, orgId, source.id, {
          progressPercent: PARSE_PROGRESS_PERCENT,
        })
      }
    })

    const models = [base.embeddingModelKey, base.pendingEmbeddingModelKey].filter(
      (key): key is string => key !== null,
    )
    if (base.embeddingModelKey === null)
      throw new Error('the knowledge base has no embedding model')
    const call = await this.callContext(orgId, source.addedByUserId, documentId)
    const embedded = new Map<string, number[][]>()
    const total = chunks.length * models.length
    let done = 0
    for (const modelKey of models) {
      const vectors: number[][] = []
      for (let at = 0; at < chunks.length; at += EMBED_BATCH_SIZE) {
        const batch = chunks.slice(at, at + EMBED_BATCH_SIZE)
        const result = await this.deps.gateway.embedMany(
          {
            ...call,
            meter: { key: `knowledge:${documentId}:${modelKey}:${at}`, sourceRefId: documentId },
          },
          {
            modelKey,
            values: batch.map(embeddingInput),
            ...(options.signal === undefined ? {} : { signal: options.signal }),
          },
        )
        vectors.push(...result.embeddings)
        done += batch.length
        if (source.type === 'file') {
          await this.progress(orgId, source.id, PARSE_PROGRESS_PERCENT, done, total)
        }
      }
      embedded.set(modelKey, vectors)
    }

    const outcome = await this.deps.db.tenant(orgId, (tx) =>
      this.store(tx, orgId, documentId, chunks, embedded),
    )
    await this.notify(orgId, outcome)
  }

  /** Marks a document failed with the reason its row shows, and finishes its source. */
  async failDocument(orgId: string, documentId: string, code: KnowledgeFailureCode): Promise<void> {
    const outcome = await this.deps.db.tenant(orgId, async (tx) => {
      const target = await this.deps.ingestion.loadTarget(tx, orgId, documentId)
      if (target === undefined) return null
      await this.deps.ingestion.setDocument(tx, orgId, documentId, {
        status: 'failed',
        errorCode: code,
      })
      return this.finishSource(tx, orgId, target)
    })
    await this.notify(orgId, outcome)
  }

  // ── Steps ─────────────────────────────────────────────────────────────────────────────────────

  /** Step 0: stop when the document, its source or its base is gone; otherwise take it. */
  private claim(
    orgId: string,
    documentId: string,
    resume: boolean,
  ): Promise<IngestTarget | undefined> {
    return this.deps.db.tenant(orgId, async (tx) => {
      const target = await this.deps.ingestion.loadTarget(tx, orgId, documentId)
      if (target === undefined) return
      if (target.source.deletedAt !== null || target.base.deletedAt !== null) return
      if (!(await this.deps.ingestion.claim(tx, orgId, documentId, resume))) return
      await this.deps.ingestion.setSource(tx, orgId, target.source.id, {
        status: 'processing',
        errorCode: null,
        ...(target.source.type === 'file' ? { progressPercent: 0 } : {}),
      })
      return target
    })
  }

  /** Step 1: the ML service reads the stored file through a short-lived signed URL. */
  private async parse(
    orgId: string,
    target: IngestTarget,
    signal: AbortSignal | undefined,
  ): Promise<ParsedDocument> {
    const { document, source } = target
    if (document.objectKey === null) throw new Error('the document has no stored file')
    const fileUrl = await this.deps.files.signedDownload(document.objectKey, {
      expiresInSeconds: URL_EXPIRES_SECONDS,
    })
    const parsed = await this.deps.ml.parseDocument(
      {
        fileUrl,
        mimeType: document.mimeType ?? source.contentType ?? 'application/octet-stream',
        orgId,
        ocr: source.ocrMode,
        requestId: `ingest-${document.id}`,
      },
      signal,
    )
    // kept for re-chunking and re-embedding without parsing again
    await this.deps.files.put(
      parsedKeyOf(orgId, document.id),
      Buffer.from(JSON.stringify(parsed)),
      'application/json',
    )
    return parsed
  }

  /** Step 3: advance the file's progress from the parse share to 100 as batches finish. */
  private progress(
    orgId: string,
    sourceId: string,
    from: number,
    done: number,
    total: number,
  ): Promise<unknown> {
    const percent = Math.min(99, from + Math.floor(((100 - from) * done) / total))
    return this.deps.db.tenant(orgId, (tx) =>
      this.deps.ingestion.setSource(tx, orgId, sourceId, { progressPercent: percent }),
    )
  }

  /**
   * Step 4, one transaction: replace the document's passages, mark it ready, move the counters
   * and derive the source's status. A model change that happened while embedding sends the job
   * round again (the retry embeds with the models that are current now).
   */
  private async store(
    tx: DbExecutor,
    orgId: string,
    documentId: string,
    chunks: readonly Chunk[],
    embedded: ReadonlyMap<string, number[][]>,
  ): Promise<SourceOutcome | null> {
    const target = await this.deps.ingestion.loadTarget(tx, orgId, documentId)
    if (!isActiveTarget(target)) return null
    const { base, document } = target
    const current = [base.embeddingModelKey, base.pendingEmbeddingModelKey].filter(
      (key): key is string => key !== null,
    )
    if (current.some((key) => !embedded.has(key))) {
      throw new Error('the embedding model changed while the document was processed')
    }
    let activeCount = 0
    for (const modelKey of current) {
      const vectors = embedded.get(modelKey) ?? []
      const items = chunks.flatMap((chunk, index) => {
        const embedding = vectors[index]
        return embedding === undefined ? [] : [{ chunk, embedding }]
      })
      const stored = await this.deps.ingestion.replaceChunks(tx, orgId, document, modelKey, items)
      if (modelKey === base.embeddingModelKey) activeCount = stored
    }
    await this.deps.ingestion.setDocument(tx, orgId, documentId, {
      status: 'ready',
      errorCode: null,
      embeddingModelKey: base.embeddingModelKey,
      chunkCount: activeCount,
      indexedAt: new Date(),
    })
    return this.finishSource(tx, orgId, target)
  }

  /**
   * Step 5: when no document of the source is open, derive its status (all ready, some failed,
   * all failed), recompute the base's counters and say who to tell. Otherwise a link or connector
   * shows the share of documents finished.
   */
  async finishSource(
    tx: DbExecutor,
    orgId: string,
    target: Pick<IngestTarget, 'source' | 'base'>,
  ): Promise<SourceOutcome | null> {
    const { source, base } = target
    await this.deps.repository.recomputeCounters(tx, orgId, base.id)
    const counts = await this.deps.ingestion.documentCounts(tx, orgId, source.id)
    if (counts.open > 0) {
      if (source.type !== 'file') {
        const percent = Math.floor((100 * (counts.ready + counts.failed)) / counts.total)
        await this.deps.ingestion.setSource(tx, orgId, source.id, { progressPercent: percent })
      }
      return null
    }
    let status: KnowledgeSourceStatus = 'ready'
    if (counts.failed > 0) status = counts.failed === counts.total ? 'failed' : 'partially_failed'
    const row = await this.deps.ingestion.setSource(tx, orgId, source.id, {
      status,
      progressPercent: status === 'failed' ? source.progressPercent : 100,
      errorCode: status === 'failed' ? counts.failedCode : null,
    })
    return {
      sourceId: source.id,
      sourceName: source.name,
      baseName: base.name,
      status,
      addedByUserId: source.addedByUserId,
      failed: counts.failed,
      stamp: (row?.updatedAt ?? new Date()).toISOString(),
    }
  }

  /** A source that failed as a whole, for a reason that is not one of its documents (an unreachable link). */
  async failSource(
    tx: DbExecutor,
    orgId: string,
    { source, base }: Pick<IngestTarget, 'source' | 'base'>,
    code: KnowledgeFailureCode,
  ): Promise<SourceOutcome> {
    const row = await this.deps.ingestion.setSource(tx, orgId, source.id, {
      status: 'failed',
      errorCode: code,
    })
    return {
      sourceId: source.id,
      sourceName: source.name,
      baseName: base.name,
      status: 'failed',
      addedByUserId: source.addedByUserId,
      failed: 0,
      stamp: (row?.updatedAt ?? new Date()).toISOString(),
    }
  }

  /** "Finished or failed processing also notifies the uploader", after the transaction commits. */
  async notify(orgId: string, outcome: SourceOutcome | null): Promise<void> {
    if (outcome?.addedByUserId == null) return
    const type = NOTIFIED[outcome.status]
    if (type === undefined) return
    await this.deps.notifications.notify(
      { orgId },
      {
        userId: outcome.addedByUserId,
        type,
        params: {
          version: 1,
          sourceName: outcome.sourceName,
          knowledgeBaseName: outcome.baseName,
          failedCount: outcome.failed,
        },
        target: { type: 'knowledge_source', id: outcome.sourceId },
        dedupeKey: `${type}:${outcome.sourceId}:${outcome.stamp}`,
      },
    )
  }

  /** The model call context of a document's embeddings: the person who added it, metered per call. */
  private async callContext(
    orgId: string,
    userId: string | null,
    documentId: string,
  ): Promise<ModelCallContext> {
    const membership =
      userId === null
        ? undefined
        : (
            await this.deps.db.tenant(orgId, (tx) =>
              this.deps.memberships.findActiveByUsersInTx(tx, orgId, [userId]),
            )
          ).get(userId)
    return {
      orgId,
      userId,
      teamIds: [],
      primaryTeamId: membership?.primaryTeamId ?? null,
      // embeddings use the base's own model, which the organization chose, not the person
      allowedModelIds: 'all',
      caller: 'knowledge',
      meter: { key: `knowledge:${documentId}`, sourceRefId: documentId },
    }
  }
}
