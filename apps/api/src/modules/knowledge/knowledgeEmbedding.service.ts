// SPDX-License-Identifier: AGPL-3.0-only
import { KNOWLEDGE_AUDIT_ACTIONS } from '@surefy/contracts'
import type {
  KnowledgeBaseDto,
  KnowledgeReindexImpactDto,
  KnowledgeReindexImpactQuery,
  SetKnowledgeEmbeddingModelInput,
} from '@surefy/contracts'

import {
  KnowledgeEmbeddingModelInvalidError,
  KnowledgeNotFoundError,
  KnowledgeReembedInProgressError,
} from './knowledge.errors.js'
import { assertLocalEmbedding } from './knowledge.service.js'

import type { KnowledgeBaseRow, KnowledgeRepository } from './knowledge.repository.js'
import type {
  KnowledgeContext,
  KnowledgeIngestionPort,
  KnowledgeModelRef,
  KnowledgeModels,
} from './knowledge.types.js'
import type { KnowledgeAccessService } from './knowledgeAccess.service.js'
import type { KnowledgeViews } from './knowledgeViews.js'
import type { Database, DbExecutor } from '@/core/database/index.js'
import type { AuditRecorder } from '@/modules/audit/index.js'

export interface KnowledgeEmbeddingDeps {
  db: Database
  repository: KnowledgeRepository
  access: KnowledgeAccessService
  views: KnowledgeViews
  models: KnowledgeModels
  ingestion: KnowledgeIngestionPort
  audit: AuditRecorder
}

/** A rough embedding rate for the "about N minutes" estimate. */
const PASSAGES_PER_MINUTE = 60

/**
 * Changing a base's embedding model, and "Re-index all" (database/knowledge.md, Re-embedding
 * swap): retrieval keeps using the active model until the swap, so the base is never unsearchable.
 */
export class KnowledgeEmbeddingService {
  constructor(private readonly deps: KnowledgeEmbeddingDeps) {}

  /** "1,240 passages will be re-indexed, about 20 minutes." */
  async impact(
    ctx: KnowledgeContext,
    baseId: string,
    query: KnowledgeReindexImpactQuery,
  ): Promise<KnowledgeReindexImpactDto> {
    return this.deps.db.tenant(ctx.orgId, async (tx) => {
      const { base } = await this.deps.access.require(tx, ctx, baseId, 'manage')
      if (query.modelKey !== undefined) await this.checkModel(tx, ctx.orgId, base, query.modelKey)
      return {
        documentCount: base.documentCount,
        chunkCount: base.chunkCount,
        estimatedMinutes: Math.ceil(base.chunkCount / PASSAGES_PER_MINUTE),
      }
    })
  }

  /**
   * Starts re-embedding with another model (Admins and above; 202). A base without a model just
   * takes it: nothing is indexed yet.
   */
  async setModel(
    ctx: KnowledgeContext,
    baseId: string,
    input: SetKnowledgeEmbeddingModelInput,
  ): Promise<KnowledgeBaseDto> {
    const { row, extras, start } = await this.deps.db.tenant(ctx.orgId, async (tx) => {
      const { base } = await this.deps.access.require(tx, ctx, baseId, 'manage')
      if (base.pendingEmbeddingModelKey !== null) throw new KnowledgeReembedInProgressError()
      await this.checkModel(tx, ctx.orgId, base, input.modelKey)
      const unchanged = base.embeddingModelKey === input.modelKey
      const direct = base.embeddingModelKey === null
      const patch = direct
        ? { embeddingModelKey: input.modelKey }
        : { pendingEmbeddingModelKey: input.modelKey }
      const updated = unchanged
        ? base
        : await this.deps.repository.updateBase(tx, ctx.orgId, baseId, patch)
      if (updated === undefined) throw new KnowledgeNotFoundError()
      if (!unchanged) {
        await this.deps.audit.record(tx, ctx, {
          action: KNOWLEDGE_AUDIT_ACTIONS.KNOWLEDGE_BASE_EMBEDDING_CHANGED,
          target: { type: 'knowledge_base', id: baseId },
          metadata: {
            changes: [
              { field: 'embeddingModel', from: base.embeddingModelKey, to: input.modelKey },
            ],
          },
        })
      }
      return {
        row: updated,
        extras: await this.deps.views.load(tx, ctx.orgId, [updated]),
        start: !unchanged && !direct,
      }
    })
    if (start) await this.deps.ingestion.enqueueReembed(ctx.orgId, baseId)
    return this.one(row, extras)
  }

  /** Cancels a running model change before the swap: the target's chunks are dropped. */
  async cancel(ctx: KnowledgeContext, baseId: string): Promise<void> {
    await this.deps.db.tenant(ctx.orgId, async (tx) => {
      const { base } = await this.deps.access.require(tx, ctx, baseId, 'manage')
      const target = base.pendingEmbeddingModelKey
      if (target === null) throw new KnowledgeReembedInProgressError()
      await this.deps.repository.updateBase(tx, ctx.orgId, baseId, {
        pendingEmbeddingModelKey: null,
      })
      await this.deps.ingestion.deleteChunksOfModelInTx(tx, ctx.orgId, baseId, target)
      await this.deps.audit.record(tx, ctx, {
        action: KNOWLEDGE_AUDIT_ACTIONS.KNOWLEDGE_BASE_EMBEDDING_CHANGED,
        target: { type: 'knowledge_base', id: baseId },
        metadata: { changes: [{ field: 'embeddingModel', from: target, to: null }] },
      })
    })
  }

  /** Re-index all: every document goes back through ingestion with the same model (T2). */
  async reindex(ctx: KnowledgeContext, baseId: string): Promise<KnowledgeBaseDto> {
    const { row, extras, documentIds } = await this.deps.db.tenant(ctx.orgId, async (tx) => {
      const { base } = await this.deps.access.require(tx, ctx, baseId, 'manage')
      if (base.pendingEmbeddingModelKey !== null) throw new KnowledgeReembedInProgressError()
      const reset = await this.deps.ingestion.resetDocumentsInTx(tx, ctx.orgId, baseId)
      await this.deps.audit.record(tx, ctx, {
        action: KNOWLEDGE_AUDIT_ACTIONS.KNOWLEDGE_BASE_REINDEXED,
        target: { type: 'knowledge_base', id: baseId },
        metadata: { counts: { documents: reset.length } },
      })
      return {
        row: base,
        extras: await this.deps.views.load(tx, ctx.orgId, [base]),
        documentIds: reset,
      }
    })
    await this.deps.ingestion.enqueueDocuments(ctx.orgId, documentIds)
    return this.one(row, extras)
  }

  /** An enabled, available embedding model; local when the base is local-only. */
  private async checkModel(
    tx: DbExecutor,
    orgId: string,
    base: KnowledgeBaseRow,
    modelKey: string,
  ): Promise<KnowledgeModelRef> {
    const model = await this.deps.models.findByKeyInTx(tx, orgId, modelKey)
    if (
      model?.type !== 'embedding' ||
      !model.isEnabled ||
      model.status !== 'available' ||
      model.embeddingDimensions === null
    ) {
      throw new KnowledgeEmbeddingModelInvalidError()
    }
    if (base.isLocalOnly) assertLocalEmbedding(model)
    return model
  }

  private async one(
    row: KnowledgeBaseRow,
    extras: Awaited<ReturnType<KnowledgeViews['load']>>,
  ): Promise<KnowledgeBaseDto> {
    const [dto] = await this.deps.views.toDtos([row], extras, new Map([[row.id, 'manage']]))
    if (dto === undefined) throw new Error('knowledge base view returned no row')
    return dto
  }
}
