// SPDX-License-Identifier: AGPL-3.0-only
import { and, asc, eq, exists, ilike, inArray, isNull, ne, or, sql } from 'drizzle-orm'

import { agentAccess, agents, agentVersions, organizationMembers } from '@/database/tables/index.js'
import {
  keysetAfter,
  keysetKey,
  keysetOrder,
  type KeysetCursor,
  type KeysetSort,
} from '@/lib/pagination.js'
import type {
  AgentAccessEntryInput,
  AgentAccessLevel,
  AgentDefinition,
  AgentStatus,
  AgentTool,
} from '@surefy/contracts'

import type { DbExecutor } from '@/core/database/index.js'
import type { SQL } from 'drizzle-orm'

export type AgentRow = typeof agents.$inferSelect
export type NewAgentRow = typeof agents.$inferInsert
export type AgentVersionRow = typeof agentVersions.$inferSelect
export type AgentAccessRow = typeof agentAccess.$inferSelect

const a = agents
const v = agentVersions
const access = agentAccess

const allOf = (...conditions: (SQL | undefined)[]): SQL => and(...conditions) ?? sql`true`

const likeTerm = (q: string): string => `%${q.replaceAll(/[\\%_]/g, (ch) => '\\' + ch)}%`

/** Who is asking, for the rows they may see and edit. `all` holds `agents:manage-all`. */
export interface Viewer {
  userId: string | null
  teamIds: readonly string[]
  all: boolean
}

/** An access row that names the viewer: everyone, one of their teams, or them. */
function audienceMatches(viewer: Viewer): SQL {
  return (
    or(
      eq(access.subjectType, 'organization'),
      viewer.teamIds.length === 0
        ? undefined
        : and(eq(access.subjectType, 'team'), inArray(access.teamId, [...viewer.teamIds])),
      viewer.userId === null
        ? undefined
        : and(eq(access.subjectType, 'user'), eq(access.userId, viewer.userId)),
    ) ?? sql`false`
  )
}

function accessFor(viewer: Viewer, level?: AgentAccessLevel): SQL {
  const atLevel = level === undefined ? sql`` : sql`and ${access.level} = ${level}`
  return exists(
    // a correlated subquery over the agents row of the outer query
    sql`(select 1 from ${access} where ${access.organizationId} = ${a.organizationId}
      and ${access.agentId} = ${a.id} and ${audienceMatches(viewer)} ${atLevel})`,
  )
}

const ownedBy = (viewer: Viewer): SQL =>
  viewer.userId === null ? sql`false` : sql`${a.ownerUserId} = ${viewer.userId}`

/** Whether the viewer may use the agent: owner, `agents:manage-all`, or a matching audience row. */
export const canSeeSql = (viewer: Viewer): SQL =>
  viewer.all ? sql`true` : sql`(${ownedBy(viewer)} or ${accessFor(viewer)})`

/** Whether the viewer may edit it: owner, `agents:manage-all`, or a matching `edit` row. */
export const canEditSql = (viewer: Viewer): SQL =>
  viewer.all ? sql`true` : sql`(${ownedBy(viewer)} or ${accessFor(viewer, 'edit')})`

export type AgentSortField = 'name' | 'lastRunAt' | 'runsThisWeek'

/**
 * `lastRunAt` and `runsThisWeek` come from the runs; until the run module orders by them, both
 * order by the last change to the draft, so a page stays stable.
 */
export function agentSort(field: AgentSortField, descending: boolean): KeysetSort {
  return field === 'name'
    ? { expression: sql`lower(${a.name})`, cast: 'text', descending }
    : { expression: a.draftUpdatedAt, cast: 'timestamptz', descending }
}

export interface AgentPageParams {
  limit: number
  sort: KeysetSort
  cursor?: KeysetCursor
  viewer: Viewer
  statuses?: readonly AgentStatus[]
  ownerId?: string
  mine?: boolean
  q?: string
}

export interface AgentListRow {
  agent: AgentRow
  sortKey: string
  canEdit: boolean
  liveVersion: number | null
  liveModelKey: string | null
  liveTools: AgentTool[] | null
}

export interface UsablePageParams {
  limit: number
  cursor?: KeysetCursor
  viewer: Viewer
  q?: string
}

export interface AgentAndLevel {
  agent: AgentRow
  canEdit: boolean
}

/** `agents`, `agent_versions` and `agent_access`. */
export class AgentsRepository {
  // ── Agents ────────────────────────────────────────────────────────────────────────────────────

  async insert(tx: DbExecutor, values: NewAgentRow): Promise<AgentRow> {
    const [row] = await tx.insert(a).values(values).returning()
    if (row === undefined) throw new Error('agent insert returned no row')
    return row
  }

  /** Serializes the creation, duplication and restoring of agents of one organization (plan limit). */
  async lockCount(tx: DbExecutor, orgId: string): Promise<void> {
    const key = `agents:${orgId}`
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${key}))`)
  }

  /** Agents that count toward `maxAgents`: not archived and not deleted. */
  async countCounting(tx: DbExecutor, orgId: string): Promise<number> {
    const [row] = await tx
      .select({ count: sql<number>`count(*)`.mapWith(Number) })
      .from(a)
      .where(and(eq(a.organizationId, orgId), isNull(a.deletedAt), ne(a.status, 'archived')))
    return row?.count ?? 0
  }

  /** The agent if the viewer may see it, and whether they may edit it. */
  async findVisible(
    tx: DbExecutor,
    orgId: string,
    id: string,
    viewer: Viewer,
  ): Promise<AgentAndLevel | undefined> {
    const [row] = await tx
      .select({ agent: a, canEdit: sql<boolean>`${canEditSql(viewer)}` })
      .from(a)
      .where(
        allOf(eq(a.organizationId, orgId), eq(a.id, id), isNull(a.deletedAt), canSeeSql(viewer)),
      )
      .limit(1)
    return row
  }

  /** Like `findVisible`, with the row locked for the rest of the transaction. */
  async lockVisible(
    tx: DbExecutor,
    orgId: string,
    id: string,
    viewer: Viewer,
  ): Promise<AgentAndLevel | undefined> {
    const [row] = await tx
      .select({ agent: a, canEdit: sql<boolean>`${canEditSql(viewer)}` })
      .from(a)
      .where(
        allOf(eq(a.organizationId, orgId), eq(a.id, id), isNull(a.deletedAt), canSeeSql(viewer)),
      )
      .limit(1)
      .for('update', { of: a })
    return row
  }

  findById(tx: DbExecutor, orgId: string, id: string) {
    return tx.query.agents.findFirst({ where: and(eq(a.organizationId, orgId), eq(a.id, id)) })
  }

  /** The ids of the agents the viewer may edit, for reads narrowed to them (Insights). */
  async editableIds(tx: DbExecutor, orgId: string, viewer: Viewer): Promise<string[]> {
    const rows = await tx
      .select({ id: a.id })
      .from(a)
      .where(allOf(eq(a.organizationId, orgId), isNull(a.deletedAt), canEditSql(viewer)))
    return rows.map((row) => row.id)
  }

  /** Names by id, tombstones included: past numbers keep the name of a deleted agent. */
  async namesIncludingDeleted(
    tx: DbExecutor,
    orgId: string,
    ids: readonly string[],
  ): Promise<Map<string, string>> {
    if (ids.length === 0) return new Map()
    const rows = await tx
      .select({ id: a.id, name: a.name })
      .from(a)
      .where(and(eq(a.organizationId, orgId), inArray(a.id, [...ids])))
    return new Map(rows.map((row) => [row.id, row.name]))
  }

  /** The agent with the live version's part the cards need, from one query. */
  private rows(tx: DbExecutor, viewer: Viewer, sort: KeysetSort) {
    return tx
      .select({
        agent: a,
        sortKey: keysetKey(sort),
        canEdit: sql<boolean>`${canEditSql(viewer)}`,
        liveVersion: v.version,
        liveModelKey: sql<string | null>`${v.definition} -> 'model' ->> 'modelKey'`,
        liveTools: sql<AgentTool[] | null>`${v.definition} -> 'tools'`,
      })
      .from(a)
      .leftJoin(v, and(eq(v.organizationId, a.organizationId), eq(v.id, a.liveVersionId)))
  }

  /** One agent as a list row, if the viewer may see it. */
  async findRow(
    tx: DbExecutor,
    orgId: string,
    id: string,
    viewer: Viewer,
  ): Promise<AgentListRow | undefined> {
    const [row] = await this.rows(tx, viewer, agentSort('name', false))
      .where(
        allOf(eq(a.organizationId, orgId), eq(a.id, id), isNull(a.deletedAt), canSeeSql(viewer)),
      )
      .limit(1)
    return row
  }

  /** The Agents list: filters, the sort key for the cursor, and the live version's part. */
  listPage(tx: DbExecutor, orgId: string, page: AgentPageParams): Promise<AgentListRow[]> {
    const statuses = page.statuses ?? []
    const wantsArchived = statuses.includes('archived')
    return this.rows(tx, page.viewer, page.sort)
      .where(
        allOf(
          eq(a.organizationId, orgId),
          isNull(a.deletedAt),
          statuses.length > 0 ? inArray(a.status, [...statuses]) : undefined,
          wantsArchived ? undefined : ne(a.status, 'archived'),
          page.ownerId === undefined ? undefined : eq(a.ownerUserId, page.ownerId),
          page.mine === true ? ownedBy(page.viewer) : undefined,
          page.q === undefined
            ? undefined
            : or(ilike(a.name, likeTerm(page.q)), ilike(a.description, likeTerm(page.q))),
          canSeeSql(page.viewer),
          keysetAfter(page.sort, a.id, page.cursor),
        ),
      )
      .orderBy(...keysetOrder(page.sort, a.id))
      .limit(page.limit + 1)
  }

  /** The agents a person may talk to: published, not paused, shared with them or theirs. */
  listUsable(tx: DbExecutor, orgId: string, page: UsablePageParams) {
    const sort: KeysetSort = { expression: sql`lower(${a.name})`, cast: 'text', descending: false }
    return tx
      .select({ agent: a, sortKey: keysetKey(sort), liveDefinition: v.definition })
      .from(a)
      .innerJoin(v, and(eq(v.organizationId, a.organizationId), eq(v.id, a.liveVersionId)))
      .where(
        allOf(
          eq(a.organizationId, orgId),
          isNull(a.deletedAt),
          eq(a.status, 'active'),
          page.q === undefined
            ? undefined
            : or(ilike(a.name, likeTerm(page.q)), ilike(a.description, likeTerm(page.q))),
          canSeeSql(page.viewer),
          keysetAfter(sort, a.id, page.cursor),
        ),
      )
      .orderBy(...keysetOrder(sort, a.id))
      .limit(page.limit + 1)
  }

  /**
   * The autosave: one statement guarded by the base revision, the status and the tombstone. Zero
   * rows means the draft moved or the agent is no longer editable; the service re-reads to tell.
   */
  async saveDraft(
    tx: DbExecutor,
    orgId: string,
    id: string,
    input: { baseRevision: number; definition: AgentDefinition; userId: string | null },
  ) {
    const [row] = await tx
      .update(a)
      .set({
        draftDefinition: input.definition,
        draftRevision: sql`${a.draftRevision} + 1`,
        draftUpdatedAt: sql`now()`,
        draftUpdatedByUserId: input.userId,
        hasUnpublishedChanges: sql`(${a.liveVersionId} is not null)`,
        updatedAt: sql`now()`,
      })
      .where(
        and(
          eq(a.organizationId, orgId),
          eq(a.id, id),
          eq(a.draftRevision, input.baseRevision),
          isNull(a.deletedAt),
          ne(a.status, 'archived'),
        ),
      )
      .returning({
        revision: a.draftRevision,
        updatedAt: a.draftUpdatedAt,
        hasUnpublishedChanges: a.hasUnpublishedChanges,
      })
    return row
  }

  async updateMetadata(
    tx: DbExecutor,
    orgId: string,
    id: string,
    values: { name?: string; description?: string | null },
  ): Promise<AgentRow> {
    const [row] = await tx
      .update(a)
      .set({
        ...(values.name === undefined ? {} : { name: values.name }),
        ...(values.description === undefined ? {} : { description: values.description }),
      })
      .where(and(eq(a.organizationId, orgId), eq(a.id, id)))
      .returning()
    if (row === undefined) throw new Error('agent update returned no row')
    return row
  }

  /** A status change with its timestamps, in the transaction that holds the row lock. */
  async setStatus(
    tx: DbExecutor,
    orgId: string,
    id: string,
    values: {
      status: AgentStatus
      pausedAt?: Date | null
      archivedAt?: Date | null
    },
  ): Promise<AgentRow> {
    const [row] = await tx
      .update(a)
      .set({
        status: values.status,
        ...(values.pausedAt === undefined ? {} : { pausedAt: values.pausedAt }),
        ...(values.archivedAt === undefined ? {} : { archivedAt: values.archivedAt }),
      })
      .where(and(eq(a.organizationId, orgId), eq(a.id, id)))
      .returning()
    if (row === undefined) throw new Error('agent status update returned no row')
    return row
  }

  /** The publish: the live pointer, the first publish's status, and a new revision. */
  async applyPublish(
    tx: DbExecutor,
    orgId: string,
    id: string,
    versionId: string,
    userId: string | null,
  ): Promise<AgentRow> {
    const [row] = await tx
      .update(a)
      .set({
        liveVersionId: versionId,
        status: sql`case when ${a.status} = 'draft' then 'active' else ${a.status} end`,
        hasUnpublishedChanges: false,
        draftRevision: sql`${a.draftRevision} + 1`,
        draftUpdatedAt: sql`now()`,
        draftUpdatedByUserId: userId,
      })
      .where(and(eq(a.organizationId, orgId), eq(a.id, id)))
      .returning()
    if (row === undefined) throw new Error('agent publish returned no row')
    return row
  }

  /** The rollback: the live pointer moves, the draft is untouched, and the draft now differs. */
  async applyRollback(
    tx: DbExecutor,
    orgId: string,
    id: string,
    versionId: string,
  ): Promise<AgentRow> {
    const [row] = await tx
      .update(a)
      .set({ liveVersionId: versionId, hasUnpublishedChanges: true })
      .where(and(eq(a.organizationId, orgId), eq(a.id, id)))
      .returning()
    if (row === undefined) throw new Error('agent rollback returned no row')
    return row
  }

  /** A never-published agent: versions, access, channels and test runs cascade. */
  async delete(tx: DbExecutor, orgId: string, id: string): Promise<void> {
    await tx.delete(a).where(and(eq(a.organizationId, orgId), eq(a.id, id)))
  }

  /** A published agent or one with runs: hidden, archived, with the audience removed. */
  async tombstone(tx: DbExecutor, orgId: string, id: string, at: Date): Promise<void> {
    await tx
      .update(a)
      .set({ deletedAt: at, status: 'archived', archivedAt: at, hasUnpublishedChanges: false })
      .where(and(eq(a.organizationId, orgId), eq(a.id, id)))
    await tx.delete(access).where(and(eq(access.organizationId, orgId), eq(access.agentId, id)))
  }

  // ── Versions ──────────────────────────────────────────────────────────────────────────────────

  async nextVersion(tx: DbExecutor, orgId: string, agentId: string): Promise<number> {
    const [row] = await tx
      .select({ next: sql<number>`coalesce(max(${v.version}), 0) + 1`.mapWith(Number) })
      .from(v)
      .where(and(eq(v.organizationId, orgId), eq(v.agentId, agentId)))
    return row?.next ?? 1
  }

  async insertVersion(
    tx: DbExecutor,
    values: typeof agentVersions.$inferInsert,
  ): Promise<AgentVersionRow> {
    const [row] = await tx.insert(v).values(values).returning()
    if (row === undefined) throw new Error('agent version insert returned no row')
    return row
  }

  async hasVersions(tx: DbExecutor, orgId: string, agentId: string): Promise<boolean> {
    const [row] = await tx
      .select({ id: v.id })
      .from(v)
      .where(and(eq(v.organizationId, orgId), eq(v.agentId, agentId)))
      .limit(1)
    return row !== undefined
  }

  findVersion(tx: DbExecutor, orgId: string, agentId: string, versionId: string) {
    return tx.query.agentVersions.findFirst({
      where: and(eq(v.organizationId, orgId), eq(v.agentId, agentId), eq(v.id, versionId)),
    })
  }

  /** Newest first; the cursor is the version number. */
  listVersions(
    tx: DbExecutor,
    orgId: string,
    agentId: string,
    page: { limit: number; cursor?: KeysetCursor },
  ) {
    const sort: KeysetSort = { expression: v.version, cast: 'bigint', descending: true }
    return tx
      .select({ version: v, sortKey: keysetKey(sort) })
      .from(v)
      .where(
        allOf(
          eq(v.organizationId, orgId),
          eq(v.agentId, agentId),
          keysetAfter(sort, v.id, page.cursor),
        ),
      )
      .orderBy(...keysetOrder(sort, v.id))
      .limit(page.limit + 1)
  }

  /** The version rows of these ids (live versions of listed agents, publishers of the page). */
  versionsByIds(tx: DbExecutor, orgId: string, ids: readonly string[]) {
    if (ids.length === 0) return Promise.resolve([])
    return tx
      .select()
      .from(v)
      .where(and(eq(v.organizationId, orgId), inArray(v.id, [...ids])))
  }

  // ── Audience ──────────────────────────────────────────────────────────────────────────────────

  listAccess(tx: DbExecutor, orgId: string, agentId: string) {
    return tx
      .select()
      .from(access)
      .where(and(eq(access.organizationId, orgId), eq(access.agentId, agentId)))
      .orderBy(asc(access.createdAt), asc(access.id))
  }

  accessOfAgents(tx: DbExecutor, orgId: string, agentIds: readonly string[]) {
    if (agentIds.length === 0) return Promise.resolve([])
    return tx
      .select()
      .from(access)
      .where(and(eq(access.organizationId, orgId), inArray(access.agentId, [...agentIds])))
      .orderBy(asc(access.createdAt), asc(access.id))
  }

  /** Replaces the whole audience; returns whether anything changed. */
  async replaceAccess(
    tx: DbExecutor,
    orgId: string,
    agentId: string,
    entries: readonly AgentAccessEntryInput[],
    userId: string | null,
  ): Promise<boolean> {
    const deleted = await tx
      .delete(access)
      .where(and(eq(access.organizationId, orgId), eq(access.agentId, agentId)))
      .returning({ id: access.id })
    if (entries.length > 0) {
      await tx.insert(access).values(
        entries.map((entry) => ({
          organizationId: orgId,
          agentId,
          subjectType: entry.subjectType,
          teamId: entry.subjectType === 'team' ? entry.teamId : null,
          userId: entry.subjectType === 'user' ? entry.userId : null,
          level: entry.level,
          createdByUserId: userId,
        })),
      )
    }
    return deleted.length > 0 || entries.length > 0
  }

  /** Which of these people are active members of the organization. */
  async activeMemberIds(
    tx: DbExecutor,
    orgId: string,
    userIds: readonly string[],
  ): Promise<ReadonlySet<string>> {
    if (userIds.length === 0) return new Set()
    const rows = await tx
      .select({ userId: organizationMembers.userId })
      .from(organizationMembers)
      .where(
        and(
          eq(organizationMembers.organizationId, orgId),
          eq(organizationMembers.status, 'active'),
          inArray(organizationMembers.userId, [...userIds]),
        ),
      )
    return new Set(rows.map((row) => row.userId))
  }
}
