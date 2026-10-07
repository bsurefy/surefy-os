// SPDX-License-Identifier: AGPL-3.0-only
import { KNOWLEDGE_ATTENTION_STATUSES, KNOWLEDGE_RESTORE_WINDOW_DAYS } from '@surefy/contracts'
import type {
  KnowledgeAccessLevel,
  KnowledgeBaseDto,
  KnowledgeEmbeddingModelDto,
  KnowledgeSourceType,
  TeamRefDto,
  UserRefDto,
} from '@surefy/contracts'

import type {
  KnowledgeBaseRow,
  KnowledgeRepository,
  SourceStatRow,
} from './knowledge.repository.js'
import type { KnowledgeModelRef, KnowledgeModels, KnowledgeUsers } from './knowledge.types.js'
import type { Database, DbExecutor } from '@/core/database/index.js'

const DAY_MS = 86_400_000
const IN_PROGRESS = new Set(['uploading', 'queued', 'processing'])
const ATTENTION = new Set<string>(KNOWLEDGE_ATTENTION_STATUSES)

export const purgeAtOf = (deletedAt: Date | null): string | null =>
  deletedAt === null
    ? null
    : new Date(deletedAt.getTime() + KNOWLEDGE_RESTORE_WINDOW_DAYS * DAY_MS).toISOString()

/** "Stays on your server" for local and trained models, "Sent to {provider}" otherwise. */
export function toEmbeddingModelDto(model: KnowledgeModelRef): KnowledgeEmbeddingModelDto {
  return {
    modelKey: model.modelKey,
    displayName: model.displayName,
    dataLocation: model.source === 'provider' ? 'provider' : 'local',
  }
}

const emptyByType = (): Record<KnowledgeSourceType, number> => ({ file: 0, link: 0, connector: 0 })

export function summarizeSources(stats: readonly SourceStatRow[]) {
  const sourcesByType = emptyByType()
  let ready = 0
  let inProgress = 0
  let needsAttention = 0
  let progressSum = 0
  for (const row of stats) {
    sourcesByType[row.type] += row.sources
    if (row.status === 'ready') ready += row.sources
    if (IN_PROGRESS.has(row.status)) {
      inProgress += row.sources
      progressSum += row.progressSum
    }
    if (ATTENTION.has(row.status)) needsAttention += row.sources
  }
  return {
    sourcesByType,
    processing: {
      ready,
      inProgress,
      needsAttention,
      progressPercent: inProgress === 0 ? 0 : Math.round(progressSum / inProgress),
    },
  }
}

export interface BaseViewDeps {
  db: Database
  repository: KnowledgeRepository
  models: KnowledgeModels
  users: KnowledgeUsers
}

/** The pieces of a base's DTO that come from other rows, loaded for a page at a time. */
interface BaseExtras {
  stats: Map<string, SourceStatRow[]>
  accessTeams: Map<string, TeamRefDto[]>
  models: Map<string, KnowledgeModelRef>
  reindex: Map<string, { total: number; done: number }>
}

/** Builds `KnowledgeBaseDto`s: a few batched reads per page, never one per base. */
export class KnowledgeViews {
  constructor(private readonly deps: BaseViewDeps) {}

  /** Reads what the DTOs need; call inside the transaction, then `toDtos` after it. */
  async load(
    tx: DbExecutor,
    orgId: string,
    rows: readonly KnowledgeBaseRow[],
  ): Promise<BaseExtras> {
    const baseIds = rows.map((row) => row.id)
    // one transaction is one connection: its queries run one after the other
    const stats = await this.deps.repository.sourceStats(tx, orgId, baseIds)
    const grants = await this.deps.repository.grantsOfBases(tx, orgId, baseIds)
    const reindex = await this.deps.repository.reindexProgress(
      tx,
      orgId,
      rows.flatMap((row) =>
        row.pendingEmbeddingModelKey === null
          ? []
          : [{ id: row.id, pendingEmbeddingModelKey: row.pendingEmbeddingModelKey }],
      ),
    )
    const modelKeys = [
      ...new Set(
        rows.flatMap((row) =>
          [row.embeddingModelKey, row.pendingEmbeddingModelKey].filter(
            (key): key is string => key !== null,
          ),
        ),
      ),
    ]
    const models = await this.deps.models.findByKeysInTx(tx, orgId, modelKeys)
    const accessTeams = new Map<string, TeamRefDto[]>()
    for (const grant of grants) {
      if (grant.subjectType !== 'team' || grant.teamId === null || grant.teamName === null) continue
      const list = accessTeams.get(grant.knowledgeBaseId) ?? []
      list.push({ id: grant.teamId, name: grant.teamName })
      accessTeams.set(grant.knowledgeBaseId, list)
    }
    return {
      stats: Map.groupBy(stats, (row) => row.baseId),
      accessTeams,
      models: new Map(models.map((model) => [model.modelKey, model])),
      reindex,
    }
  }

  /** Maps rows to DTOs; looks up the creators outside the transaction. */
  async toDtos(
    rows: readonly KnowledgeBaseRow[],
    extras: BaseExtras,
    levels: ReadonlyMap<string, KnowledgeAccessLevel>,
  ): Promise<KnowledgeBaseDto[]> {
    const creators = await this.deps.users.findUserRefs(
      rows.flatMap((row) => (row.createdByUserId === null ? [] : [row.createdByUserId])),
    )
    return rows.map((row) => toBaseDto(row, extras, levels.get(row.id) ?? 'search', creators))
  }
}

function modelDto(
  key: string | null,
  models: ReadonlyMap<string, KnowledgeModelRef>,
): KnowledgeEmbeddingModelDto | null {
  if (key === null) return null
  const model = models.get(key)
  // a model removed from the Vault since: keep the key so the base still names what it uses
  return model === undefined
    ? { modelKey: key, displayName: key, dataLocation: 'provider' }
    : toEmbeddingModelDto(model)
}

export function toBaseDto(
  row: KnowledgeBaseRow,
  extras: BaseExtras,
  level: KnowledgeAccessLevel,
  creators: ReadonlyMap<string, UserRefDto>,
): KnowledgeBaseDto {
  const { sourcesByType, processing } = summarizeSources(extras.stats.get(row.id) ?? [])
  const progress = extras.reindex.get(row.id)
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    isLocalOnly: row.isLocalOnly,
    chunkingPreset: row.chunkingPreset,
    embeddingModel: modelDto(row.embeddingModelKey, extras.models),
    reindex:
      row.pendingEmbeddingModelKey === null
        ? null
        : {
            target: modelDto(row.pendingEmbeddingModelKey, extras.models),
            documentsTotal: progress?.total ?? 0,
            documentsDone: progress?.done ?? 0,
          },
    sourceCount: row.sourceCount,
    sourcesByType,
    documentCount: row.documentCount,
    chunkCount: row.chunkCount,
    processing,
    // agents arrive with V1; until then nothing uses a base
    usedByCount: 0,
    accessTeams: extras.accessTeams.get(row.id) ?? [],
    effectiveLevel: level,
    createdBy: row.createdByUserId === null ? null : (creators.get(row.createdByUserId) ?? null),
    deletedAt: row.deletedAt?.toISOString() ?? null,
    purgeAt: purgeAtOf(row.deletedAt),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}
