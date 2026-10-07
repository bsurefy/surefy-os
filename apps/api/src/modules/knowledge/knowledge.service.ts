// SPDX-License-Identifier: AGPL-3.0-only
import { sqlState, type Database } from '@/core/database/index.js'
import { decodeCursor, toPage } from '@/lib/pagination.js'
import { TeamNotFoundError } from '@/modules/teams/index.js'
import { KNOWLEDGE_AUDIT_ACTIONS } from '@surefy/contracts'
import type {
  CreateKnowledgeBaseInput,
  DeletedKnowledgeItemDto,
  KnowledgeBaseDto,
  KnowledgeBaseImpactDto,
  KnowledgeSummaryDto,
  ListDeletedKnowledgeQuery,
  ListKnowledgeBasesQuery,
  RestoreKnowledgeBaseInput,
  UpdateKnowledgeBaseInput,
} from '@surefy/contracts'

import {
  KnowledgeLocalEmbeddingRequiredError,
  KnowledgeNameTakenError,
  KnowledgeNotFoundError,
  KnowledgeReembedInProgressError,
} from './knowledge.errors.js'
import {
  knowledgeBaseSort,
  type KnowledgeBaseRow,
  type KnowledgeRepository,
} from './knowledge.repository.js'
import { searcherOf, type KnowledgeAccessService } from './knowledgeAccess.service.js'
import { visibilityOf } from './knowledgeAccess.utils.js'
import { purgeAtOf, type KnowledgeViews } from './knowledgeViews.js'

import type {
  KnowledgeContext,
  KnowledgeIngestionPort,
  KnowledgeModelRef,
  KnowledgeModels,
  KnowledgeOrganizations,
  KnowledgeTeams,
  KnowledgeUsers,
} from './knowledge.types.js'
import type { AuditRecorder } from '@/modules/audit/index.js'

export interface KnowledgeServiceDeps {
  db: Database
  repository: KnowledgeRepository
  access: KnowledgeAccessService
  views: KnowledgeViews
  teams: KnowledgeTeams
  users: KnowledgeUsers
  organizations: KnowledgeOrganizations
  models: KnowledgeModels
  ingestion: KnowledgeIngestionPort
  audit: AuditRecorder
}

const UNIQUE_VIOLATION = '23505'

const nameConflict = (error: unknown): never => {
  if (sqlState(error) === UNIQUE_VIOLATION) throw new KnowledgeNameTakenError()
  throw error
}

/** A local-models-only base needs a local or trained embedding model. */
export function assertLocalEmbedding(model: KnowledgeModelRef | undefined): void {
  if (model?.source === 'provider') {
    throw new KnowledgeLocalEmbeddingRequiredError()
  }
}

/** Non-secret field changes of a base, for the audit entry. */
const baseChanges = (before: KnowledgeBaseRow, after: KnowledgeBaseRow) =>
  (['name', 'description', 'isLocalOnly', 'chunkingPreset'] as const).flatMap((field) =>
    before[field] === after[field] ? [] : [{ field, from: before[field], to: after[field] }],
  )

/**
 * Knowledge bases: list, KPIs, create, rename, delete and restore (database/knowledge.md §1).
 * Writes need Can manage on the base; a base the caller cannot search does not exist for them.
 */
export class KnowledgeService {
  constructor(private readonly deps: KnowledgeServiceDeps) {}

  async list(
    ctx: KnowledgeContext,
    query: ListKnowledgeBasesQuery,
  ): Promise<{ items: KnowledgeBaseDto[]; nextCursor: string | null }> {
    const deleted = query.state === 'deleted'
    const sort = knowledgeBaseSort(query.sort, deleted)
    const who = searcherOf(ctx)
    const { rows, extras, levels } = await this.deps.db.tenant(ctx.orgId, async (tx) => {
      const page = await this.deps.repository.listBasesPage(tx, ctx.orgId, visibilityOf(who), {
        limit: query.limit,
        sort,
        level: deleted ? 'manage' : 'search',
        deleted,
        ...(query.q === undefined ? {} : { q: query.q }),
        ...(query.isLocalOnly === undefined ? {} : { isLocalOnly: query.isLocalOnly }),
        ...(query.needsAttention === undefined ? {} : { needsAttention: query.needsAttention }),
        ...(query.cursor === undefined ? {} : { cursor: decodeCursor(query.cursor) }),
      })
      const shown = page.slice(0, query.limit).map((row) => row.base)
      return {
        rows: page,
        extras: await this.deps.views.load(tx, ctx.orgId, shown),
        levels: await this.deps.access.levelsFor(
          tx,
          ctx.orgId,
          who,
          shown.map((b) => b.id),
        ),
      }
    })
    const { items, nextCursor } = toPage(rows, query.limit, (row) => ({
      k: row.sortKey,
      id: row.base.id,
    }))
    const dtos = await this.deps.views.toDtos(
      items.map((row) => row.base),
      extras,
      levels,
    )
    return { items: dtos, nextCursor }
  }

  summary(ctx: KnowledgeContext): Promise<KnowledgeSummaryDto> {
    return this.deps.db.tenant(ctx.orgId, (tx) =>
      this.deps.repository.summary(tx, ctx.orgId, visibilityOf(searcherOf(ctx))),
    )
  }

  async get(ctx: KnowledgeContext, baseId: string): Promise<KnowledgeBaseDto> {
    const { base, level, extras } = await this.deps.db.tenant(ctx.orgId, async (tx) => {
      const found = await this.deps.access.require(tx, ctx, baseId, 'search')
      return { ...found, extras: await this.deps.views.load(tx, ctx.orgId, [found.base]) }
    })
    return this.one(base, extras, level)
  }

  /**
   * The base starts on the organization's embedding model; the creator gets Can manage and the
   * chosen teams Can search, all in one transaction.
   */
  async create(ctx: KnowledgeContext, input: CreateKnowledgeBaseInput): Promise<KnowledgeBaseDto> {
    const teamIds = [...new Set(input.teamIds)]
    const { base, extras } = await this.deps.db
      .tenant(ctx.orgId, async (tx) => {
        if (await this.deps.repository.nameExists(tx, ctx.orgId, input.name)) {
          throw new KnowledgeNameTakenError()
        }
        if (teamIds.length > 0) {
          const found = await this.deps.teams.findRefsInTx(tx, ctx.orgId, teamIds)
          if (found.length !== teamIds.length) throw new TeamNotFoundError()
        }
        const modelKey = await this.deps.models.organizationEmbeddingModelKeyInTx(tx, ctx.orgId)
        if (input.isLocalOnly && modelKey !== null) {
          assertLocalEmbedding(await this.deps.models.findByKeyInTx(tx, ctx.orgId, modelKey))
        }
        const created = await this.deps.repository.insertBase(tx, {
          organizationId: ctx.orgId,
          name: input.name,
          description: input.description ?? null,
          isLocalOnly: input.isLocalOnly,
          chunkingPreset: input.chunkingPreset,
          embeddingModelKey: modelKey,
          createdByUserId: ctx.userId,
        })
        await this.deps.repository.insertGrants(tx, [
          ...(ctx.userId === null
            ? []
            : [
                {
                  organizationId: ctx.orgId,
                  knowledgeBaseId: created.id,
                  subjectType: 'user' as const,
                  userId: ctx.userId,
                  level: 'manage' as const,
                  createdByUserId: ctx.userId,
                },
              ]),
          ...teamIds.map((teamId) => ({
            organizationId: ctx.orgId,
            knowledgeBaseId: created.id,
            subjectType: 'team' as const,
            teamId,
            level: 'search' as const,
            createdByUserId: ctx.userId,
          })),
        ])
        await this.deps.organizations.bumpAccessVersionInTx(tx, ctx.orgId)
        await this.deps.audit.record(tx, ctx, {
          action: KNOWLEDGE_AUDIT_ACTIONS.KNOWLEDGE_BASE_CREATED,
          target: { type: 'knowledge_base', id: created.id },
          metadata: {
            counts: { teams: teamIds.length },
            labels: { isLocalOnly: created.isLocalOnly, chunkingPreset: created.chunkingPreset },
          },
        })
        return { base: created, extras: await this.deps.views.load(tx, ctx.orgId, [created]) }
      })
      .catch(nameConflict)
    return this.one(base, extras, 'manage')
  }

  /** A different chunking preset re-indexes the base: every ready document goes back to pending. */
  async update(
    ctx: KnowledgeContext,
    baseId: string,
    input: UpdateKnowledgeBaseInput,
  ): Promise<KnowledgeBaseDto> {
    const { row, extras, documentIds } = await this.deps.db
      .tenant(ctx.orgId, async (tx) => {
        const { base: current } = await this.deps.access.require(tx, ctx, baseId, 'manage')
        if (
          input.name !== undefined &&
          (await this.deps.repository.nameExists(tx, ctx.orgId, input.name, baseId))
        ) {
          throw new KnowledgeNameTakenError()
        }
        const reindexes =
          input.chunkingPreset !== undefined && input.chunkingPreset !== current.chunkingPreset
        if (reindexes && current.pendingEmbeddingModelKey !== null) {
          throw new KnowledgeReembedInProgressError()
        }
        if (input.isLocalOnly === true && current.embeddingModelKey !== null) {
          assertLocalEmbedding(
            await this.deps.models.findByKeyInTx(tx, ctx.orgId, current.embeddingModelKey),
          )
        }
        const updated = await this.deps.repository.updateBase(tx, ctx.orgId, baseId, {
          ...(input.name === undefined ? {} : { name: input.name }),
          ...(input.description === undefined ? {} : { description: input.description }),
          ...(input.isLocalOnly === undefined ? {} : { isLocalOnly: input.isLocalOnly }),
          ...(input.chunkingPreset === undefined ? {} : { chunkingPreset: input.chunkingPreset }),
        })
        if (updated === undefined) throw new KnowledgeNotFoundError()
        const reset = reindexes
          ? await this.deps.ingestion.resetDocumentsInTx(tx, ctx.orgId, baseId)
          : []
        await this.deps.audit.record(tx, ctx, {
          action: KNOWLEDGE_AUDIT_ACTIONS.KNOWLEDGE_BASE_UPDATED,
          target: { type: 'knowledge_base', id: baseId },
          metadata: { changes: baseChanges(current, updated) },
        })
        return {
          row: updated,
          extras: await this.deps.views.load(tx, ctx.orgId, [updated]),
          documentIds: reset,
        }
      })
      .catch(nameConflict)
    await this.deps.ingestion.enqueueDocuments(ctx.orgId, documentIds)
    return this.one(row, extras, 'manage')
  }

  /** The T3 delete dialog: what goes away with the base. */
  async impact(ctx: KnowledgeContext, baseId: string): Promise<KnowledgeBaseImpactDto> {
    return this.deps.db.tenant(ctx.orgId, async (tx) => {
      const { base } = await this.deps.access.require(tx, ctx, baseId, 'manage')
      return {
        sourceCount: base.sourceCount,
        chunkCount: base.chunkCount,
        // agents (V1) and chats' knowledge scopes (chats module) are counted when those tables exist
        agentCount: 0,
        agents: [],
        chatCount: 0,
        restoreWindowDays: 30,
      }
    })
  }

  /** Moves the base to Recently deleted; sources keep their own state, so a restore is exact. */
  async delete(ctx: KnowledgeContext, baseId: string): Promise<void> {
    await this.deps.db.tenant(ctx.orgId, async (tx) => {
      await this.deps.access.require(tx, ctx, baseId, 'manage')
      const row = await this.deps.repository.softDeleteBase(tx, ctx.orgId, baseId, ctx.userId)
      if (row === undefined) throw new KnowledgeNotFoundError()
      await this.deps.audit.record(tx, ctx, {
        action: KNOWLEDGE_AUDIT_ACTIONS.KNOWLEDGE_BASE_DELETED,
        target: { type: 'knowledge_base', id: baseId },
        metadata: { counts: { sources: row.sourceCount } },
      })
    })
  }

  /** Brings a deleted base back; a taken name needs a new one (`KNOWLEDGE_NAME_TAKEN`). */
  async restore(
    ctx: KnowledgeContext,
    baseId: string,
    input: RestoreKnowledgeBaseInput,
  ): Promise<KnowledgeBaseDto> {
    const { row, extras } = await this.deps.db
      .tenant(ctx.orgId, async (tx) => {
        const { base } = await this.deps.access.require(tx, ctx, baseId, 'manage', {
          allowDeleted: true,
        })
        if (base.deletedAt === null) throw new KnowledgeNotFoundError()
        const name = input.name ?? base.name
        if (await this.deps.repository.nameExists(tx, ctx.orgId, name, baseId)) {
          throw new KnowledgeNameTakenError()
        }
        const restored = await this.deps.repository.restoreBase(tx, ctx.orgId, baseId, input.name)
        if (restored === undefined) throw new KnowledgeNotFoundError()
        await this.deps.audit.record(tx, ctx, {
          action: KNOWLEDGE_AUDIT_ACTIONS.KNOWLEDGE_BASE_RESTORED,
          target: { type: 'knowledge_base', id: baseId },
        })
        return { row: restored, extras: await this.deps.views.load(tx, ctx.orgId, [restored]) }
      })
      .catch(nameConflict)
    return this.one(row, extras, 'manage')
  }

  /** Bases and sources deleted in the last 30 days that the caller can manage, most recent first. */
  async listDeleted(
    ctx: KnowledgeContext,
    query: ListDeletedKnowledgeQuery,
  ): Promise<{ items: DeletedKnowledgeItemDto[]; nextCursor: string | null }> {
    const who = searcherOf(ctx)
    const kinds = query.kind ?? ['knowledge_base', 'source']
    const cursor = query.cursor === undefined ? undefined : decodeCursor(query.cursor)
    const found = await this.deps.db.tenant(ctx.orgId, async (tx) => {
      const bases = kinds.includes('knowledge_base')
        ? await this.deps.repository.listBasesPage(tx, ctx.orgId, visibilityOf(who), {
            limit: query.limit,
            sort: knowledgeBaseSort('-deletedAt', true),
            level: 'manage',
            deleted: true,
            ...(query.q === undefined ? {} : { q: query.q }),
            ...(cursor === undefined ? {} : { cursor }),
          })
        : []
      const sources = kinds.includes('source')
        ? await this.deps.repository.listDeletedSourcesPage(tx, ctx.orgId, visibilityOf(who), {
            limit: query.limit,
            ...(query.q === undefined ? {} : { q: query.q }),
            ...(cursor === undefined ? {} : { cursor }),
          })
        : []
      return { bases, sources }
    })
    const merged = [
      ...found.bases.map((row) => ({
        at: row.base.deletedAt,
        key: row.sortKey,
        id: row.base.id,
        row,
      })),
      ...found.sources.map((row) => ({
        at: row.source.deletedAt,
        key: row.sortKey,
        id: row.source.id,
        row,
      })),
    ].sort((a, b) => (b.at?.getTime() ?? 0) - (a.at?.getTime() ?? 0) || (a.id < b.id ? 1 : -1))
    const { items, nextCursor } = toPage(merged, query.limit, (entry) => ({
      k: entry.key,
      id: entry.id,
    }))
    const people = await this.deps.users.findUserRefs(
      items.flatMap((entry) => {
        const id =
          'base' in entry.row ? entry.row.base.deletedByUserId : entry.row.source.deletedByUserId
        return id === null ? [] : [id]
      }),
    )
    return {
      items: items.map((entry): DeletedKnowledgeItemDto => {
        if ('base' in entry.row) {
          const { base } = entry.row
          return {
            kind: 'knowledge_base',
            id: base.id,
            name: base.name,
            deletedAt: (base.deletedAt ?? new Date()).toISOString(),
            purgeAt: purgeAtOf(base.deletedAt) ?? '',
            deletedBy:
              base.deletedByUserId === null ? null : (people.get(base.deletedByUserId) ?? null),
            sourceCount: base.sourceCount,
            canRestore: true,
          }
        }
        const { source, baseName } = entry.row
        return {
          kind: 'source',
          id: source.id,
          name: source.name,
          deletedAt: (source.deletedAt ?? new Date()).toISOString(),
          purgeAt: purgeAtOf(source.deletedAt) ?? '',
          deletedBy:
            source.deletedByUserId === null ? null : (people.get(source.deletedByUserId) ?? null),
          sourceType: source.type,
          knowledgeBase: { id: source.knowledgeBaseId, name: baseName },
          canRestore: true,
        }
      }),
      nextCursor,
    }
  }

  private async one(
    row: KnowledgeBaseRow,
    extras: Awaited<ReturnType<KnowledgeViews['load']>>,
    level: 'search' | 'manage',
  ): Promise<KnowledgeBaseDto> {
    const [dto] = await this.deps.views.toDtos([row], extras, new Map([[row.id, level]]))
    if (dto === undefined) throw new Error('knowledge base view returned no row')
    return dto
  }
}
