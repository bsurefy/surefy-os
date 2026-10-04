// SPDX-License-Identifier: AGPL-3.0-only
import { and, asc, eq, ilike, inArray, isNull, or, sql, type SQL } from 'drizzle-orm'

import { organizationMembers, organizations, users } from '@/database/tables/index.js'
import {
  keysetAfter,
  keysetKey,
  keysetOrder,
  parseSort,
  type KeysetCursor,
  type KeysetSort,
} from '@/lib/pagination.js'
import type { MemberStatus, OrgRole } from '@surefy/contracts'

import type { DbExecutor } from '@/core/database/index.js'

export type MembershipRow = typeof organizationMembers.$inferSelect
export type NewMembershipRow = typeof organizationMembers.$inferInsert
export type MembershipPatch = Partial<
  Pick<
    NewMembershipRow,
    'role' | 'status' | 'primaryTeamId' | 'deactivatedAt' | 'deactivatedByUserId'
  >
>

export interface MembershipPageParams {
  limit: number
  cursor?: KeysetCursor
  sort: KeysetSort
  q?: string
  roles?: readonly OrgRole[]
  statuses?: readonly MemberStatus[]
  teamId?: string
}

const m = organizationMembers

/** `?sort=` of the Members table: newest first by default, or by name or last activity. */
export const memberSort = (sort: string | undefined): KeysetSort => {
  const { field, descending } = parseSort<'createdAt' | 'name' | 'lastActiveAt'>(sort, '-createdAt')
  if (field === 'name') return { expression: sql`lower(${users.name})`, cast: 'text', descending }
  if (field === 'lastActiveAt') {
    // Never active sorts as the oldest activity.
    return {
      expression: sql`coalesce(${m.lastActiveAt}, '-infinity'::timestamptz)`,
      cast: 'timestamptz',
      descending,
    }
  }
  return { expression: m.createdAt, cast: 'timestamptz', descending }
}

/** Escapes `%`, `_` and `\` so a search term matches literally. */
const likeTerm = (q: string): string => {
  const escaped = q.replaceAll(/[\\%_]/g, (c) => '\\' + c)
  return `%${escaped}%`
}

/**
 * `organization_members`. Every tenant query filters by organization, even though RLS does too.
 * Joins to `users` (global) and `team_members` are read-only, for search, sorting and filters.
 */
export class MembershipsRepository {
  async insert(tx: DbExecutor, values: NewMembershipRow): Promise<MembershipRow> {
    const [row] = await tx.insert(m).values(values).returning()
    if (row === undefined) throw new Error('membership insert returned no row')
    return row
  }

  findById(tx: DbExecutor, orgId: string, memberId: string) {
    return tx.query.organizationMembers.findFirst({
      where: and(eq(m.organizationId, orgId), eq(m.id, memberId)),
    })
  }

  findByUser(tx: DbExecutor, orgId: string, userId: string) {
    return tx.query.organizationMembers.findFirst({
      where: and(eq(m.organizationId, orgId), eq(m.userId, userId)),
    })
  }

  findByIds(tx: DbExecutor, orgId: string, memberIds: readonly string[]) {
    if (memberIds.length === 0) return Promise.resolve([])
    return tx
      .select()
      .from(m)
      .where(and(eq(m.organizationId, orgId), inArray(m.id, [...memberIds])))
  }

  findByUsers(tx: DbExecutor, orgId: string, userIds: readonly string[]) {
    if (userIds.length === 0) return Promise.resolve([])
    return tx
      .select()
      .from(m)
      .where(and(eq(m.organizationId, orgId), inArray(m.userId, [...userIds])))
  }

  /** The membership of the person with this email (read-only join to the global `users`). */
  async findByEmail(tx: DbExecutor, orgId: string, email: string) {
    const [row] = await tx
      .select({ id: m.id, status: m.status })
      .from(m)
      .innerJoin(users, eq(users.id, m.userId))
      .where(and(eq(m.organizationId, orgId), eq(users.email, email)))
    return row
  }

  /**
   * The Members table, on `organization_members_organization_id_created_at_id_idx` for the
   * default sort. Search, the `name` sort and the team filter read `users` and `team_members`.
   */
  async listPage(tx: DbExecutor, orgId: string, page: MembershipPageParams) {
    const filters: (SQL | undefined)[] = [
      eq(m.organizationId, orgId),
      page.q === undefined
        ? undefined
        : or(ilike(users.name, likeTerm(page.q)), ilike(users.email, likeTerm(page.q))),
      page.roles === undefined ? undefined : inArray(m.role, [...page.roles]),
      page.statuses === undefined ? undefined : inArray(m.status, [...page.statuses]),
      page.teamId === undefined
        ? undefined
        : sql`exists (select 1 from team_members tf
            where tf.organization_id = organization_members.organization_id
              and tf.user_id = organization_members.user_id and tf.team_id = ${page.teamId})`,
      keysetAfter(page.sort, m.id, page.cursor),
    ]
    return tx
      .select({ membership: m, sortKey: keysetKey(page.sort) })
      .from(m)
      .innerJoin(users, eq(users.id, m.userId))
      .where(and(...filters))
      .orderBy(...keysetOrder(page.sort, m.id))
      .limit(page.limit + 1)
  }

  async update(tx: DbExecutor, orgId: string, memberId: string, patch: MembershipPatch) {
    const [row] = await tx
      .update(m)
      .set(patch)
      .where(and(eq(m.organizationId, orgId), eq(m.id, memberId)))
      .returning()
    return row
  }

  async delete(tx: DbExecutor, orgId: string, memberId: string): Promise<void> {
    await tx.delete(m).where(and(eq(m.organizationId, orgId), eq(m.id, memberId)))
  }

  /**
   * Locks the active Owners (`organization_members_organization_id_role_idx`) so two concurrent
   * changes cannot both remove the last one; returns their membership ids.
   */
  async lockActiveOwners(tx: DbExecutor, orgId: string): Promise<string[]> {
    const rows = await tx
      .select({ id: m.id })
      .from(m)
      .where(and(eq(m.organizationId, orgId), eq(m.role, 'owner'), eq(m.status, 'active')))
      .for('update')
    return rows.map((row) => row.id)
  }

  /** The first team a member joins becomes their primary team; returns whether it changed. */
  async setPrimaryTeamIfNull(
    tx: DbExecutor,
    orgId: string,
    userId: string,
    teamId: string,
  ): Promise<boolean> {
    const rows = await tx
      .update(m)
      .set({ primaryTeamId: teamId })
      .where(and(eq(m.organizationId, orgId), eq(m.userId, userId), isNull(m.primaryTeamId)))
      .returning({ id: m.id })
    return rows.length > 0
  }

  /** Moves the members charged to `fromTeamId` to `toTeamId` (or none); returns whether it changed. */
  async replacePrimaryTeam(
    tx: DbExecutor,
    orgId: string,
    userId: string,
    fromTeamId: string,
    toTeamId: string | null,
  ): Promise<boolean> {
    const rows = await tx
      .update(m)
      .set({ primaryTeamId: toTeamId })
      .where(
        and(eq(m.organizationId, orgId), eq(m.userId, userId), eq(m.primaryTeamId, fromTeamId)),
      )
      .returning({ id: m.id })
    return rows.length > 0
  }

  /**
   * `/me` under `db.user`: the person's active memberships and their organizations, through
   * `organization_members_self_read` and `organizations_member_read` (read-only join).
   */
  listActiveForUser(tx: DbExecutor, userId: string) {
    return tx
      .select({
        organizationId: organizations.id,
        name: organizations.name,
        slug: organizations.slug,
        logoObjectKey: organizations.logoObjectKey,
        status: organizations.status,
        role: m.role,
        primaryTeamId: m.primaryTeamId,
        joinedAt: m.joinedAt,
      })
      .from(m)
      .innerJoin(organizations, eq(organizations.id, m.organizationId))
      .where(and(eq(m.userId, userId), eq(m.status, 'active')))
      .orderBy(asc(organizations.name), asc(organizations.id))
  }
}
