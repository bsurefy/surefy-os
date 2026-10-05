// SPDX-License-Identifier: AGPL-3.0-only
import {
  and,
  count,
  eq,
  ilike,
  inArray,
  isNotNull,
  isNull,
  ne,
  or,
  sql,
  type SQL,
} from 'drizzle-orm'

import {
  knowledgeBaseAccess,
  knowledgeBases,
  knowledgeDocuments,
  knowledgeSources,
  teams,
} from '@/database/tables/index.js'
import {
  keysetAfter,
  keysetKey,
  keysetOrder,
  parseSort,
  type KeysetCursor,
  type KeysetSort,
} from '@/lib/pagination.js'
import { KNOWLEDGE_ATTENTION_STATUSES } from '@surefy/contracts'
import type {
  KnowledgeAccessLevel,
  KnowledgeAccessSubjectType,
  KnowledgeSourceStatus,
  KnowledgeSourceType,
} from '@surefy/contracts'

import type { DbExecutor } from '@/core/database/index.js'

export type KnowledgeBaseRow = typeof knowledgeBases.$inferSelect
export type NewKnowledgeBaseRow = typeof knowledgeBases.$inferInsert
export type KnowledgeBasePatch = Partial<
  Pick<
    NewKnowledgeBaseRow,
    | 'name'
    | 'description'
    | 'isLocalOnly'
    | 'chunkingPreset'
    | 'embeddingModelKey'
    | 'pendingEmbeddingModelKey'
  >
>
export type KnowledgeAccessRow = typeof knowledgeBaseAccess.$inferSelect

/**
 * Which bases a caller reaches: every base (Admins and Owners), or those with a grant to the
 * person or one of their teams. `teamsManage` is false for Users, whose teams' Can manage only
 * searches (the Can manage of a team applies to its Builders and above).
 */
export type KnowledgeVisibility =
  | { kind: 'all' }
  | { kind: 'member'; userId: string | null; teamIds: readonly string[]; teamsManage: boolean }

export interface BasePageParams {
  limit: number
  cursor?: KeysetCursor
  sort: KeysetSort
  q?: string
  isLocalOnly?: boolean
  needsAttention?: boolean
  /** Bases the caller can search (`search`) or manage (`manage`). */
  level: KnowledgeAccessLevel
  deleted: boolean
}

/** Escapes `%`, `_` and `\` so a search term matches literally. */
const likeTerm = (q: string): string => `%${q.replaceAll(/[\\%_]/g, (c) => '\\' + c)}%`

const kb = knowledgeBases
const kbAccess = knowledgeBaseAccess
const ks = knowledgeSources
const kd = knowledgeDocuments

/** `?sort=` of the bases list. */
export const knowledgeBaseSort = (sort: string | undefined, deleted: boolean): KeysetSort => {
  const { field, descending } = parseSort<'name' | 'updatedAt' | 'deletedAt'>(
    sort,
    deleted ? '-deletedAt' : 'name',
  )
  if (field === 'name') return { expression: sql`lower(${kb.name})`, cast: 'text', descending }
  if (field === 'deletedAt') return { expression: kb.deletedAt, cast: 'timestamptz', descending }
  return { expression: kb.updatedAt, cast: 'timestamptz', descending }
}

/**
 * The grants that let a caller reach a base at `level`; undefined when every base is reachable.
 * `orgColumn` and `baseColumn` name the outer query's columns, which Drizzle does not alias.
 */
function grantExists(
  visibility: KnowledgeVisibility,
  level: KnowledgeAccessLevel,
  columns: { org: SQL; base: SQL } = {
    org: sql`knowledge_bases.organization_id`,
    base: sql`knowledge_bases.id`,
  },
): SQL | undefined {
  if (visibility.kind === 'all') return undefined
  const subjects: SQL[] = []
  if (visibility.userId !== null) {
    subjects.push(sql`(a.subject_type = 'user' and a.user_id = ${visibility.userId}::uuid)`)
  }
  if (visibility.teamIds.length > 0 && (level === 'search' || visibility.teamsManage)) {
    const teamIds = sql.join(
      visibility.teamIds.map((id) => sql`${id}::uuid`),
      sql`, `,
    )
    subjects.push(sql`(a.subject_type = 'team' and a.team_id in (${teamIds}))`)
  }
  if (subjects.length === 0) return sql`false`
  const levelMatch = level === 'manage' ? sql` and a.level = 'manage'` : sql``
  const anySubject = sql.join(subjects, sql` or `)
  return sql`exists (select 1 from knowledge_base_access a
    where a.organization_id = ${columns.org} and a.knowledge_base_id = ${columns.base}${levelMatch}
      and (${anySubject}))`
}

const attentionStatuses = sql.join(
  KNOWLEDGE_ATTENTION_STATUSES.map((status) => sql`${status}`),
  sql`, `,
)

export interface SourceStatRow {
  baseId: string
  type: KnowledgeSourceType
  status: KnowledgeSourceStatus
  sources: number
  progressSum: number
}

export interface GrantRow {
  baseId: string
  subjectType: KnowledgeAccessSubjectType
  teamId: string | null
  userId: string | null
  level: KnowledgeAccessLevel
}

/** `knowledge_bases` and `knowledge_base_access`. Every query filters by organization. */
export class KnowledgeRepository {
  async insertBase(tx: DbExecutor, values: NewKnowledgeBaseRow): Promise<KnowledgeBaseRow> {
    const [row] = await tx.insert(kb).values(values).returning()
    if (row === undefined) throw new Error('knowledge base insert returned no row')
    return row
  }

  findBase(tx: DbExecutor, orgId: string, baseId: string) {
    return tx.query.knowledgeBases.findFirst({
      where: and(eq(kb.organizationId, orgId), eq(kb.id, baseId)),
    })
  }

  findBases(tx: DbExecutor, orgId: string, baseIds: readonly string[]) {
    if (baseIds.length === 0) return Promise.resolve([])
    return tx
      .select()
      .from(kb)
      .where(and(eq(kb.organizationId, orgId), inArray(kb.id, [...baseIds])))
  }

  /** Case-insensitive among active bases, like `knowledge_bases_organization_id_name_key`. */
  async nameExists(
    tx: DbExecutor,
    orgId: string,
    name: string,
    exceptBaseId?: string,
  ): Promise<boolean> {
    const [row] = await tx
      .select({ id: kb.id })
      .from(kb)
      .where(
        and(
          eq(kb.organizationId, orgId),
          isNull(kb.deletedAt),
          sql`lower(${kb.name}) = lower(${name})`,
          exceptBaseId === undefined ? undefined : ne(kb.id, exceptBaseId),
        ),
      )
      .limit(1)
    return row !== undefined
  }

  async updateBase(
    tx: DbExecutor,
    orgId: string,
    baseId: string,
    patch: KnowledgeBasePatch,
  ): Promise<KnowledgeBaseRow | undefined> {
    const [row] = await tx
      .update(kb)
      .set(patch)
      .where(and(eq(kb.organizationId, orgId), eq(kb.id, baseId)))
      .returning()
    return row
  }

  async softDeleteBase(
    tx: DbExecutor,
    orgId: string,
    baseId: string,
    userId: string | null,
  ): Promise<KnowledgeBaseRow | undefined> {
    const [row] = await tx
      .update(kb)
      .set({ deletedAt: new Date(), deletedByUserId: userId })
      .where(and(eq(kb.organizationId, orgId), eq(kb.id, baseId), isNull(kb.deletedAt)))
      .returning()
    return row
  }

  async restoreBase(
    tx: DbExecutor,
    orgId: string,
    baseId: string,
    name: string | undefined,
  ): Promise<KnowledgeBaseRow | undefined> {
    const [row] = await tx
      .update(kb)
      .set({
        deletedAt: null,
        deletedByUserId: null,
        ...(name === undefined ? {} : { name }),
      })
      .where(and(eq(kb.organizationId, orgId), eq(kb.id, baseId), isNotNull(kb.deletedAt)))
      .returning()
    return row
  }

  /** Bases of a page: visible ones (or deletable ones) in the requested state. */
  listBasesPage(
    tx: DbExecutor,
    orgId: string,
    visibility: KnowledgeVisibility,
    page: BasePageParams,
  ) {
    return tx
      .select({ base: kb, sortKey: keysetKey(page.sort) })
      .from(kb)
      .where(
        and(
          eq(kb.organizationId, orgId),
          page.deleted ? isNotNull(kb.deletedAt) : isNull(kb.deletedAt),
          grantExists(visibility, page.level),
          page.q === undefined ? undefined : ilike(kb.name, likeTerm(page.q)),
          page.isLocalOnly === undefined ? undefined : eq(kb.isLocalOnly, page.isLocalOnly),
          page.needsAttention === true
            ? sql`exists (select 1 from knowledge_sources s
                where s.organization_id = knowledge_bases.organization_id
                  and s.knowledge_base_id = knowledge_bases.id and s.deleted_at is null
                  and s.status in (${attentionStatuses}))`
            : undefined,
          keysetAfter(page.sort, kb.id, page.cursor),
        ),
      )
      .orderBy(...keysetOrder(page.sort, kb.id))
      .limit(page.limit + 1)
  }

  /** The active bases a caller can search, optionally narrowed to some ids (a chat's scope). */
  async searchableBaseIds(
    tx: DbExecutor,
    orgId: string,
    visibility: KnowledgeVisibility,
    only?: readonly string[],
  ): Promise<string[]> {
    if (only?.length === 0) return []
    const rows = await tx
      .select({ id: kb.id })
      .from(kb)
      .where(
        and(
          eq(kb.organizationId, orgId),
          isNull(kb.deletedAt),
          grantExists(visibility, 'search'),
          only === undefined ? undefined : inArray(kb.id, [...only]),
        ),
      )
    return rows.map((row) => row.id)
  }

  /** Deleted sources of active bases the caller manages, for Recently deleted. */
  listDeletedSourcesPage(
    tx: DbExecutor,
    orgId: string,
    visibility: KnowledgeVisibility,
    page: { limit: number; cursor?: KeysetCursor; q?: string },
  ) {
    const sort: KeysetSort = { expression: ks.deletedAt, cast: 'timestamptz', descending: true }
    return tx
      .select({
        source: ks,
        baseName: kb.name,
        sortKey: keysetKey(sort),
      })
      .from(ks)
      .innerJoin(kb, and(eq(kb.organizationId, ks.organizationId), eq(kb.id, ks.knowledgeBaseId)))
      .where(
        and(
          eq(ks.organizationId, orgId),
          isNotNull(ks.deletedAt),
          isNull(kb.deletedAt),
          grantExists(visibility, 'manage', {
            org: sql`knowledge_sources.organization_id`,
            base: sql`knowledge_sources.knowledge_base_id`,
          }),
          page.q === undefined ? undefined : ilike(ks.name, likeTerm(page.q)),
          keysetAfter(sort, ks.id, page.cursor),
        ),
      )
      .orderBy(...keysetOrder(sort, ks.id))
      .limit(page.limit + 1)
  }

  /** Active bases and sources the caller can search, for the KPIs above the list. */
  async summary(tx: DbExecutor, orgId: string, visibility: KnowledgeVisibility) {
    const [bases] = await tx
      .select({ value: count() })
      .from(kb)
      .where(
        and(eq(kb.organizationId, orgId), isNull(kb.deletedAt), grantExists(visibility, 'search')),
      )
    const [stats] = await tx
      .select({
        sources: count(),
        processing: sql<number>`count(*) filter (where ${ks.status} in ('uploading', 'queued', 'processing'))::integer`,
        needsAttention: sql<number>`count(*) filter (where ${ks.status} in (${attentionStatuses}))::integer`,
      })
      .from(ks)
      .innerJoin(kb, and(eq(kb.organizationId, ks.organizationId), eq(kb.id, ks.knowledgeBaseId)))
      .where(
        and(
          eq(ks.organizationId, orgId),
          isNull(ks.deletedAt),
          isNull(kb.deletedAt),
          grantExists(visibility, 'search'),
        ),
      )
    return {
      knowledgeBases: bases?.value ?? 0,
      sources: stats?.sources ?? 0,
      processing: stats?.processing ?? 0,
      needsAttention: stats?.needsAttention ?? 0,
    }
  }

  /** Active sources per base, type and status, with the progress to average. */
  async sourceStats(
    tx: DbExecutor,
    orgId: string,
    baseIds: readonly string[],
  ): Promise<SourceStatRow[]> {
    if (baseIds.length === 0) return []
    const rows = await tx
      .select({
        baseId: ks.knowledgeBaseId,
        type: ks.type,
        status: ks.status,
        sources: count(),
        progressSum: sql<number>`coalesce(sum(${ks.progressPercent}), 0)::integer`,
      })
      .from(ks)
      .where(
        and(
          eq(ks.organizationId, orgId),
          isNull(ks.deletedAt),
          inArray(ks.knowledgeBaseId, [...baseIds]),
        ),
      )
      .groupBy(ks.knowledgeBaseId, ks.type, ks.status)
    return rows
  }

  /** Re-embedding progress per base: documents with a complete chunk set, and those on the target. */
  async reindexProgress(
    tx: DbExecutor,
    orgId: string,
    bases: readonly { id: string; pendingEmbeddingModelKey: string }[],
  ): Promise<Map<string, { total: number; done: number }>> {
    const progress = new Map<string, { total: number; done: number }>()
    for (const base of bases) {
      const [row] = await tx
        .select({
          total: count(),
          done: sql<number>`count(*) filter (where ${kd.embeddingModelKey} = ${base.pendingEmbeddingModelKey})::integer`,
        })
        .from(kd)
        .innerJoin(ks, and(eq(ks.organizationId, kd.organizationId), eq(ks.id, kd.sourceId)))
        .where(
          and(
            eq(kd.organizationId, orgId),
            eq(kd.knowledgeBaseId, base.id),
            eq(kd.status, 'ready'),
            isNull(ks.deletedAt),
          ),
        )
      progress.set(base.id, { total: row?.total ?? 0, done: row?.done ?? 0 })
    }
    return progress
  }

  /**
   * Recomputes the stored counters of a base from its sources, documents and chunks, in the
   * caller's transaction (database/knowledge.md §1, Counters).
   */
  async recomputeCounters(tx: DbExecutor, orgId: string, baseId: string): Promise<void> {
    await tx.execute(sql`
      with doc as (
        select d.id, d.chunk_count
        from knowledge_documents d
        join knowledge_sources s on s.organization_id = d.organization_id and s.id = d.source_id
        where d.organization_id = ${orgId}::uuid and d.knowledge_base_id = ${baseId}::uuid
          and s.deleted_at is null and d.status = 'ready'
      )
      update knowledge_bases b set
        source_count = (select count(*)::integer from knowledge_sources s
          where s.organization_id = b.organization_id and s.knowledge_base_id = b.id
            and s.deleted_at is null),
        document_count = (select count(*)::integer from doc),
        chunk_count = (select coalesce(sum(chunk_count), 0)::integer from doc)
      where b.organization_id = ${orgId}::uuid and b.id = ${baseId}::uuid`)
  }

  // ── Access ────────────────────────────────────────────────────────────────────────────────────

  /** Every grant of the bases, with the team rows' names to follow through `teams`. */
  async grantsOfBases(
    tx: DbExecutor,
    orgId: string,
    baseIds: readonly string[],
  ): Promise<(KnowledgeAccessRow & { teamName: string | null })[]> {
    if (baseIds.length === 0) return []
    const rows = await tx
      .select({ access: kbAccess, teamName: teams.name })
      .from(kbAccess)
      .leftJoin(
        teams,
        and(eq(teams.organizationId, kbAccess.organizationId), eq(teams.id, kbAccess.teamId)),
      )
      .where(
        and(eq(kbAccess.organizationId, orgId), inArray(kbAccess.knowledgeBaseId, [...baseIds])),
      )
      .orderBy(kbAccess.createdAt, kbAccess.id)
    return rows.map((row) => ({ ...row.access, teamName: row.teamName }))
  }

  /** The grants that apply to a person and their teams, on the given bases. */
  async grantsFor(
    tx: DbExecutor,
    orgId: string,
    baseIds: readonly string[],
    who: { userId: string | null; teamIds: readonly string[] },
  ): Promise<GrantRow[]> {
    if (baseIds.length === 0) return []
    const subjects = [
      who.userId === null
        ? undefined
        : and(eq(kbAccess.subjectType, 'user'), eq(kbAccess.userId, who.userId)),
      who.teamIds.length === 0
        ? undefined
        : and(eq(kbAccess.subjectType, 'team'), inArray(kbAccess.teamId, [...who.teamIds])),
    ].filter((condition): condition is SQL => condition !== undefined)
    if (subjects.length === 0) return []
    return tx
      .select({
        baseId: kbAccess.knowledgeBaseId,
        subjectType: kbAccess.subjectType,
        teamId: kbAccess.teamId,
        userId: kbAccess.userId,
        level: kbAccess.level,
      })
      .from(kbAccess)
      .where(
        and(
          eq(kbAccess.organizationId, orgId),
          inArray(kbAccess.knowledgeBaseId, [...baseIds]),
          or(...subjects),
        ),
      )
  }

  async insertGrants(tx: DbExecutor, values: (typeof kbAccess.$inferInsert)[]): Promise<void> {
    if (values.length === 0) return
    await tx.insert(kbAccess).values(values)
  }

  /** Replaces all grants of a base; returns how many rows were removed. */
  async deleteGrants(tx: DbExecutor, orgId: string, baseId: string): Promise<number> {
    const rows = await tx
      .delete(kbAccess)
      .where(and(eq(kbAccess.organizationId, orgId), eq(kbAccess.knowledgeBaseId, baseId)))
      .returning({ id: kbAccess.id })
    return rows.length
  }

  // ── Impact ────────────────────────────────────────────────────────────────────────────────────

  /** Members of a team, for "Remove access" (the people who lose it through the team). */
  async teamMemberCount(tx: DbExecutor, orgId: string, teamId: string): Promise<number> {
    const result = await tx.execute<{ count: number }>(
      sql`select count(*)::integer as count from team_members
        where organization_id = ${orgId}::uuid and team_id = ${teamId}::uuid`,
    )
    return result.rows[0]?.count ?? 0
  }
}
