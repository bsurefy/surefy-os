// SPDX-License-Identifier: AGPL-3.0-only
import { and, asc, count, eq, ilike, inArray, ne, or, sql, type SQL } from 'drizzle-orm'

import { organizationMembers, teamMembers, teams, users } from '@/database/tables/index.js'
import {
  keysetAfter,
  keysetKey,
  keysetOrder,
  parseSort,
  type KeysetCursor,
  type KeysetSort,
} from '@/lib/pagination.js'

import type { DbExecutor } from '@/core/database/index.js'

export type TeamRow = typeof teams.$inferSelect
export type NewTeamRow = typeof teams.$inferInsert
export type TeamPatch = Partial<Pick<NewTeamRow, 'name' | 'description' | 'leadUserId'>>
export type NewTeamMemberRow = typeof teamMembers.$inferInsert

export interface TeamPageParams {
  limit: number
  cursor?: KeysetCursor
  sort: KeysetSort
  q?: string
}

export interface TeamMemberPageParams {
  limit: number
  cursor?: KeysetCursor
  q?: string
}

/** Escapes `%`, `_` and `\` so a search term matches literally. */
const likeTerm = (q: string): string => {
  const escaped = q.replaceAll(/[\\%_]/g, (c) => '\\' + c)
  return `%${escaped}%`
}

const tm = teamMembers
const om = organizationMembers

/** Team members, counted per team. */
// The outer table is named in full: Drizzle renders a single-table query's columns unqualified,
// and an unqualified `id` inside the subquery would mean the subquery's own table.
const memberCount = sql<number>`(select count(*)::integer from team_members c
  where c.organization_id = teams.organization_id and c.team_id = teams.id)`

/**
 * Members charged to the team: a read-only count over `organization_members.primary_team_id`
 * (organization_members_organization_id_primary_team_id_idx).
 */
const primaryMemberCount = sql<number>`(select count(*)::integer from organization_members p
  where p.organization_id = teams.organization_id and p.primary_team_id = teams.id)`

/** `?sort=` of the teams list: by name (case-insensitive, the default) or creation time. */
export const teamSort = (sort: string | undefined): KeysetSort => {
  const { field, descending } = parseSort<'name' | 'createdAt'>(sort, 'name')
  return field === 'name'
    ? { expression: sql`lower(${teams.name})`, cast: 'text', descending }
    : { expression: teams.createdAt, cast: 'timestamptz', descending }
}

/** Team member lists sort by when people joined the team, then by user id. */
export const TEAM_MEMBER_SORT: KeysetSort = {
  expression: tm.createdAt,
  cast: 'timestamptz',
  descending: false,
}

/**
 * `teams` and `team_members`. Every query filters by organization even though RLS does too.
 * Reads of `organization_members` and `users` are read-only joins for counts, roles and search.
 */
export class TeamsRepository {
  async insert(tx: DbExecutor, values: NewTeamRow): Promise<TeamRow> {
    const [row] = await tx.insert(teams).values(values).returning()
    if (row === undefined) throw new Error('team insert returned no row')
    return row
  }

  findById(tx: DbExecutor, orgId: string, teamId: string) {
    return tx.query.teams.findFirst({
      where: and(eq(teams.organizationId, orgId), eq(teams.id, teamId)),
    })
  }

  /** Case-insensitive, like `teams_organization_id_name_key`. */
  async existsByName(
    tx: DbExecutor,
    orgId: string,
    name: string,
    exceptTeamId?: string,
  ): Promise<boolean> {
    const [row] = await tx
      .select({ id: teams.id })
      .from(teams)
      .where(
        and(
          eq(teams.organizationId, orgId),
          sql`lower(${teams.name}) = lower(${name})`,
          exceptTeamId === undefined ? undefined : ne(teams.id, exceptTeamId),
        ),
      )
      .limit(1)
    return row !== undefined
  }

  async listPage(tx: DbExecutor, orgId: string, page: TeamPageParams) {
    return tx
      .select({ team: teams, memberCount, primaryMemberCount, sortKey: keysetKey(page.sort) })
      .from(teams)
      .where(
        and(
          eq(teams.organizationId, orgId),
          page.q === undefined ? undefined : ilike(teams.name, likeTerm(page.q)),
          keysetAfter(page.sort, teams.id, page.cursor),
        ),
      )
      .orderBy(...keysetOrder(page.sort, teams.id))
      .limit(page.limit + 1)
  }

  async counts(tx: DbExecutor, orgId: string, teamId: string) {
    const [row] = await tx
      .select({ memberCount, primaryMemberCount })
      .from(teams)
      .where(and(eq(teams.organizationId, orgId), eq(teams.id, teamId)))
    return row ?? { memberCount: 0, primaryMemberCount: 0 }
  }

  findRefs(tx: DbExecutor, orgId: string, teamIds: readonly string[]) {
    if (teamIds.length === 0) return Promise.resolve([])
    return tx
      .select({ id: teams.id, name: teams.name })
      .from(teams)
      .where(and(eq(teams.organizationId, orgId), inArray(teams.id, [...teamIds])))
  }

  async update(tx: DbExecutor, orgId: string, teamId: string, patch: TeamPatch) {
    const [row] = await tx
      .update(teams)
      .set(patch)
      .where(and(eq(teams.organizationId, orgId), eq(teams.id, teamId)))
      .returning()
    return row
  }

  /** Cascades to `team_members`, `invitation_teams` and clears primary teams (foreign keys). */
  async delete(tx: DbExecutor, orgId: string, teamId: string): Promise<boolean> {
    const rows = await tx
      .delete(teams)
      .where(and(eq(teams.organizationId, orgId), eq(teams.id, teamId)))
      .returning({ id: teams.id })
    return rows.length > 0
  }

  /** People already in the team are skipped; returns the user ids actually added. */
  async insertMembers(tx: DbExecutor, rows: readonly NewTeamMemberRow[]): Promise<string[]> {
    if (rows.length === 0) return []
    const inserted = await tx
      .insert(tm)
      .values([...rows])
      .onConflictDoNothing()
      .returning({ userId: tm.userId })
    return inserted.map((row) => row.userId)
  }

  async deleteMember(
    tx: DbExecutor,
    orgId: string,
    teamId: string,
    userId: string,
  ): Promise<boolean> {
    const rows = await tx
      .delete(tm)
      .where(and(eq(tm.organizationId, orgId), eq(tm.teamId, teamId), eq(tm.userId, userId)))
      .returning({ userId: tm.userId })
    return rows.length > 0
  }

  async isMember(tx: DbExecutor, orgId: string, teamId: string, userId: string) {
    const [row] = await tx
      .select({ userId: tm.userId })
      .from(tm)
      .where(and(eq(tm.organizationId, orgId), eq(tm.teamId, teamId), eq(tm.userId, userId)))
    return row !== undefined
  }

  /** "My teams", earliest joined first (`team_members_organization_id_user_id_idx`). */
  async listTeamIdsForUser(tx: DbExecutor, orgId: string, userId: string): Promise<string[]> {
    const rows = await tx
      .select({ teamId: tm.teamId })
      .from(tm)
      .where(and(eq(tm.organizationId, orgId), eq(tm.userId, userId)))
      .orderBy(asc(tm.createdAt), asc(tm.teamId))
    return rows.map((row) => row.teamId)
  }

  /** Teams of several members, for the Members table. */
  listRefsByUsers(tx: DbExecutor, orgId: string, userIds: readonly string[]) {
    if (userIds.length === 0) return Promise.resolve([])
    return tx
      .select({ userId: tm.userId, id: teams.id, name: teams.name })
      .from(tm)
      .innerJoin(teams, and(eq(teams.organizationId, tm.organizationId), eq(teams.id, tm.teamId)))
      .where(and(eq(tm.organizationId, orgId), inArray(tm.userId, [...userIds])))
      .orderBy(asc(tm.createdAt), asc(teams.id))
  }

  async countMembers(tx: DbExecutor, orgId: string, teamId: string): Promise<number> {
    const [row] = await tx
      .select({ n: count() })
      .from(tm)
      .where(and(eq(tm.organizationId, orgId), eq(tm.teamId, teamId)))
    return row?.n ?? 0
  }

  /**
   * The team detail's member list with each person's role and primary team (read-only join to
   * `organization_members`) and the search on name and email (read-only join to `users`).
   */
  async listMembersPage(tx: DbExecutor, orgId: string, teamId: string, page: TeamMemberPageParams) {
    const filters: (SQL | undefined)[] = [
      eq(tm.organizationId, orgId),
      eq(tm.teamId, teamId),
      page.q === undefined
        ? undefined
        : or(ilike(users.name, likeTerm(page.q)), ilike(users.email, likeTerm(page.q))),
      keysetAfter(TEAM_MEMBER_SORT, tm.userId, page.cursor),
    ]
    return tx
      .select({
        userId: tm.userId,
        addedAt: tm.createdAt,
        role: om.role,
        primaryTeamId: om.primaryTeamId,
        sortKey: keysetKey(TEAM_MEMBER_SORT),
      })
      .from(tm)
      .innerJoin(om, and(eq(om.organizationId, tm.organizationId), eq(om.userId, tm.userId)))
      .innerJoin(users, eq(users.id, tm.userId))
      .where(and(...filters))
      .orderBy(...keysetOrder(TEAM_MEMBER_SORT, tm.userId))
      .limit(page.limit + 1)
  }

  /** The lead left the team or the organization: the team has no lead until one is chosen. */
  async clearLead(tx: DbExecutor, orgId: string, userId: string, teamId?: string): Promise<void> {
    await tx
      .update(teams)
      .set({ leadUserId: null })
      .where(
        and(
          eq(teams.organizationId, orgId),
          eq(teams.leadUserId, userId),
          teamId === undefined ? undefined : eq(teams.id, teamId),
        ),
      )
  }
}
