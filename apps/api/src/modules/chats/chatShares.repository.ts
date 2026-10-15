// SPDX-License-Identifier: AGPL-3.0-only
import { and, asc, eq, inArray, isNull, ne, or, sql, type SQL } from 'drizzle-orm'

import {
  chatShares,
  chats,
  organizationMembers,
  teamMembers,
  teams,
  users,
} from '@/database/tables/index.js'
import {
  keysetAfter,
  keysetKey,
  keysetOrder,
  type KeysetCursor,
  type KeysetSort,
} from '@/lib/pagination.js'

import type { ChatRow } from './chats.mapper.js'
import type { DbExecutor } from '@/core/database/index.js'

const s = chatShares
const c = chats

export type ChatShareRow = typeof chatShares.$inferSelect
export type NewChatShareRow = typeof chatShares.$inferInsert

/** A share with the team it names, for the owner's list. */
export interface ChatShareListRow {
  share: ChatShareRow
  teamName: string | null
  teamMemberCount: number
}

/** A chat as one of the people it is shared with reaches it. */
export interface SharedChatRow {
  chat: ChatRow
  /** The earliest share that reaches the person. */
  sharedAt: Date
  sharedByUserId: string | null
  sortKey: string
}

/** A person or team the share dialog can pick; `sortKey` orders teams first, then by name. */
export interface ShareTargetRow {
  subjectType: 'user' | 'team'
  id: string
  name: string
  memberCount: number
  sortKey: string
}

/** Who reads: a person and the teams they belong to. */
export interface ShareReader {
  userId: string
  teamIds: readonly string[]
}

const SHARED_SORT: KeysetSort = {
  expression: c.lastMessageAt,
  cast: 'timestamptz',
  descending: true,
}

/** Active members of the organization (the people a share reaches and a chat's owner). */
const activeMember = (orgId: SQL | string, userId: SQL | typeof c.ownerUserId): SQL => sql`exists (
  select 1 from ${organizationMembers} om
  where om.organization_id = ${orgId} and om.user_id = ${userId} and om.status = 'active')`

/** A share row of this chat that names the reader or one of their teams. */
const reaches = (reader: ShareReader): SQL | undefined =>
  or(
    eq(s.userId, reader.userId),
    reader.teamIds.length === 0 ? undefined : inArray(s.teamId, [...reader.teamIds]),
  )

/**
 * `chat_shares` and the reads that honor them. A share counts only while the chat is not deleted,
 * not private, has messages, and its owner is an active member; the organization setting is the
 * service's check.
 */
export class ChatSharesRepository {
  // ── The owner's side ────────────────────────────────────────────────────────────────────────

  async list(tx: DbExecutor, orgId: string, chatId: string): Promise<ChatShareListRow[]> {
    const counts = tx
      .select({
        teamId: teamMembers.teamId,
        n: sql<number>`count(*)::int`.as('n'),
      })
      .from(teamMembers)
      .innerJoin(
        organizationMembers,
        and(
          eq(organizationMembers.organizationId, teamMembers.organizationId),
          eq(organizationMembers.userId, teamMembers.userId),
          eq(organizationMembers.status, 'active'),
        ),
      )
      .where(eq(teamMembers.organizationId, orgId))
      .groupBy(teamMembers.teamId)
      .as('counts')
    return tx
      .select({
        share: s,
        teamName: teams.name,
        teamMemberCount: sql<number>`coalesce(${counts.n}, 0)::int`,
      })
      .from(s)
      .leftJoin(teams, and(eq(teams.organizationId, s.organizationId), eq(teams.id, s.teamId)))
      .leftJoin(counts, eq(counts.teamId, s.teamId))
      .where(and(eq(s.organizationId, orgId), eq(s.chatId, chatId)))
      .orderBy(asc(s.createdAt), asc(s.id))
  }

  async count(tx: DbExecutor, orgId: string, chatId: string): Promise<number> {
    const [row] = await tx
      .select({ n: sql<number>`count(*)::int` })
      .from(s)
      .where(and(eq(s.organizationId, orgId), eq(s.chatId, chatId)))
    return row?.n ?? 0
  }

  /**
   * The distinct active members the shares of a chat reach, the owner left out: "3 people will
   * lose access" when the chat is deleted or turned private.
   */
  async peopleWithAccess(
    tx: DbExecutor,
    orgId: string,
    chatId: string,
    ownerUserId: string,
  ): Promise<string[]> {
    const rows = await tx.execute<{ user_id: string }>(sql`
      select distinct reached.user_id from (
        select cs.user_id from ${s} cs
        where cs.organization_id = ${orgId} and cs.chat_id = ${chatId} and cs.user_id is not null
        union
        select tm.user_id from ${s} cs
        join ${teamMembers} tm on tm.organization_id = cs.organization_id and tm.team_id = cs.team_id
        where cs.organization_id = ${orgId} and cs.chat_id = ${chatId}
      ) reached
      where reached.user_id <> ${ownerUserId} and ${activeMember(orgId, sql`reached.user_id`)}
      order by reached.user_id`)
    return rows.rows.map((row) => row.user_id)
  }

  /** Inserts the shares; subjects that already have one are left as they are. */
  async insert(tx: DbExecutor, rows: readonly NewChatShareRow[]): Promise<ChatShareRow[]> {
    if (rows.length === 0) return []
    return tx
      .insert(s)
      .values([...rows])
      .onConflictDoNothing()
      .returning()
  }

  async find(
    tx: DbExecutor,
    orgId: string,
    chatId: string,
    shareId: string,
  ): Promise<ChatShareRow | undefined> {
    const [row] = await tx
      .select()
      .from(s)
      .where(and(eq(s.organizationId, orgId), eq(s.chatId, chatId), eq(s.id, shareId)))
    return row
  }

  async delete(tx: DbExecutor, orgId: string, shareId: string): Promise<void> {
    await tx.delete(s).where(and(eq(s.organizationId, orgId), eq(s.id, shareId)))
  }

  /** Turning a chat private removes every share; returns what was removed. */
  async deleteAll(tx: DbExecutor, orgId: string, chatId: string): Promise<ChatShareRow[]> {
    return tx
      .delete(s)
      .where(and(eq(s.organizationId, orgId), eq(s.chatId, chatId)))
      .returning()
  }

  /** The people of the organization among `userIds` who are active members. */
  async activeMembers(
    tx: DbExecutor,
    orgId: string,
    userIds: readonly string[],
  ): Promise<Set<string>> {
    if (userIds.length === 0) return new Set()
    const rows = await tx
      .select({ userId: organizationMembers.userId })
      .from(organizationMembers)
      .where(
        and(
          eq(organizationMembers.organizationId, orgId),
          inArray(organizationMembers.userId, [...userIds]),
          eq(organizationMembers.status, 'active'),
        ),
      )
    return new Set(rows.map((row) => row.userId))
  }

  /** The teams of the organization among `teamIds`, with their names. */
  async teams(
    tx: DbExecutor,
    orgId: string,
    teamIds: readonly string[],
  ): Promise<Map<string, string>> {
    if (teamIds.length === 0) return new Map()
    const rows = await tx
      .select({ id: teams.id, name: teams.name })
      .from(teams)
      .where(and(eq(teams.organizationId, orgId), inArray(teams.id, [...teamIds])))
    return new Map(rows.map((row) => [row.id, row.name]))
  }

  /** The active members of each team. */
  async teamMembers(
    tx: DbExecutor,
    orgId: string,
    teamIds: readonly string[],
  ): Promise<Map<string, string[]>> {
    const byTeam = new Map<string, string[]>()
    if (teamIds.length === 0) return byTeam
    const rows = await tx
      .select({ teamId: teamMembers.teamId, userId: teamMembers.userId })
      .from(teamMembers)
      .innerJoin(
        organizationMembers,
        and(
          eq(organizationMembers.organizationId, teamMembers.organizationId),
          eq(organizationMembers.userId, teamMembers.userId),
          eq(organizationMembers.status, 'active'),
        ),
      )
      .where(and(eq(teamMembers.organizationId, orgId), inArray(teamMembers.teamId, [...teamIds])))
      .orderBy(asc(teamMembers.createdAt))
    for (const row of rows) byTeam.set(row.teamId, [...(byTeam.get(row.teamId) ?? []), row.userId])
    return byTeam
  }

  /**
   * The share dialog's lookup: every team, then the active members other than the caller,
   * matched on names and emails; a keyset page.
   */
  async targets(
    tx: DbExecutor,
    orgId: string,
    callerId: string,
    page: { q?: string; limit: number; cursor?: KeysetCursor },
  ): Promise<ShareTargetRow[]> {
    const like =
      page.q === undefined ? null : `%${page.q.replaceAll(/[\\%_]/g, (ch) => '\\' + ch)}%`
    const after =
      page.cursor === undefined
        ? sql`true`
        : sql`(target.sort_key, target.id) > (${page.cursor.k}, ${page.cursor.id}::uuid)`
    const rows = await tx.execute<{
      subject_type: 'user' | 'team'
      id: string
      name: string
      member_count: number
      sort_key: string
    }>(sql`
      select * from (
        select 'team' as subject_type, t.id, t.name,
          (select count(*)::int from ${teamMembers} tm
           join ${organizationMembers} om on om.organization_id = tm.organization_id
             and om.user_id = tm.user_id and om.status = 'active'
           where tm.organization_id = t.organization_id and tm.team_id = t.id) as member_count,
          '0:' || lower(t.name) as sort_key
        from ${teams} t
        where t.organization_id = ${orgId} and (${like}::text is null or t.name ilike ${like})
        union all
        select 'user', u.id, u.name, 0, '1:' || lower(u.name)
        from ${organizationMembers} om join ${users} u on u.id = om.user_id
        where om.organization_id = ${orgId} and om.status = 'active' and om.user_id <> ${callerId}
          and (${like}::text is null or u.name ilike ${like} or u.email ilike ${like})
      ) target
      where ${after}
      order by target.sort_key, target.id
      limit ${page.limit + 1}`)
    return rows.rows.map((row) => ({
      subjectType: row.subject_type,
      id: row.id,
      name: row.name,
      memberCount: row.member_count,
      sortKey: row.sort_key,
    }))
  }

  // ── The reader's side ───────────────────────────────────────────────────────────────────────

  /** The chat when a share reaches the reader and is honored; never the reader's own chat. */
  async findShared(
    tx: DbExecutor,
    orgId: string,
    reader: ShareReader,
    chatId: string,
  ): Promise<SharedChatRow | undefined> {
    const [row] = await this.shared(tx, orgId, reader, { chatId, limit: 1 })
    return row
  }

  /** "Shared with me": a keyset page, newest message first. */
  listShared(
    tx: DbExecutor,
    orgId: string,
    reader: ShareReader,
    page: { limit: number; cursor?: KeysetCursor },
  ): Promise<SharedChatRow[]> {
    return this.shared(tx, orgId, reader, {
      limit: page.limit + 1,
      ...(page.cursor === undefined ? {} : { cursor: page.cursor }),
    })
  }

  private async shared(
    tx: DbExecutor,
    orgId: string,
    reader: ShareReader,
    options: { chatId?: string; limit: number; cursor?: KeysetCursor },
  ): Promise<SharedChatRow[]> {
    // the earliest share that reaches the reader: when and by whom it was shared
    const first = tx
      .selectDistinctOn([s.chatId], {
        chatId: s.chatId,
        sharedAt: s.createdAt,
        sharedByUserId: s.sharedByUserId,
      })
      .from(s)
      .where(and(eq(s.organizationId, orgId), reaches(reader)))
      .orderBy(s.chatId, asc(s.createdAt), asc(s.id))
      .as('first_share')
    const rows = await tx
      .select({
        chat: c,
        sharedAt: first.sharedAt,
        sharedByUserId: first.sharedByUserId,
        sortKey: keysetKey(SHARED_SORT),
      })
      .from(c)
      .innerJoin(first, eq(first.chatId, c.id))
      .where(
        and(
          eq(c.organizationId, orgId),
          options.chatId === undefined ? undefined : eq(c.id, options.chatId),
          ne(c.ownerUserId, reader.userId),
          isNull(c.deletedAt),
          eq(c.isPrivate, false),
          sql`${c.messageCount} > 0`,
          activeMember(orgId, c.ownerUserId),
          keysetAfter(SHARED_SORT, c.id, options.cursor),
        ),
      )
      .orderBy(...keysetOrder(SHARED_SORT, c.id))
      .limit(options.limit)
    return rows
  }
}
