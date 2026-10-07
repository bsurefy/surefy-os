// SPDX-License-Identifier: AGPL-3.0-only
import { and, asc, eq, inArray, isNotNull, isNull, ne, sql, type SQL } from 'drizzle-orm'

import {
  chatFolders,
  chatKnowledgeBases,
  chatMessageFeedback,
  chatMessages,
  chats,
} from '@/database/tables/index.js'
import {
  keysetAfter,
  keysetKey,
  keysetOrder,
  parseSort,
  type KeysetCursor,
  type KeysetSort,
} from '@/lib/pagination.js'
import type { ListChatsQuery } from '@surefy/contracts'

import { MATCHED_TEXT_MAX_CHARS } from './chats.constants.js'

import type { ChatFolderRow, ChatRow } from './chats.mapper.js'
import type { DbExecutor } from '@/core/database/index.js'

const c = chats
const f = chatFolders

export type NewChatRow = typeof chats.$inferInsert

/** What `PATCH` and the message transaction change on a chat; `undefined` leaves a column alone. */
export type ChatPatch = Partial<
  Pick<
    ChatRow,
    | 'title'
    | 'titleGenerated'
    | 'folderId'
    | 'isPinned'
    | 'pinnedAt'
    | 'isPrivate'
    | 'knowledgeScope'
    | 'currentModelKey'
    | 'lastMessageAt'
    | 'deletedAt'
    | 'deletedByUserId'
  >
>

export interface ChatListRow {
  chat: ChatRow
  sortKey: string
  matchedText: string | null
}

const chatSort = (sort: string | undefined, state: 'active' | 'deleted'): KeysetSort => {
  const { field, descending } = parseSort<'lastMessageAt' | 'pinnedAt' | 'deletedAt'>(
    sort,
    state === 'deleted' ? '-deletedAt' : '-lastMessageAt',
  )
  const column = { lastMessageAt: c.lastMessageAt, pinnedAt: c.pinnedAt, deletedAt: c.deletedAt }[
    field
  ]
  return { expression: column, cast: 'timestamptz', descending }
}

const folderCondition = (folderId: string | undefined): SQL | undefined => {
  if (folderId === undefined) return undefined
  return folderId === 'none' ? isNull(c.folderId) : eq(c.folderId, folderId)
}

/** `chats` and `chat_folders`, always for one owner: every query filters by organization and person. */
export class ChatsRepository {
  // ── Chats ───────────────────────────────────────────────────────────────────────────────────

  async findOwned(
    tx: DbExecutor,
    orgId: string,
    userId: string,
    chatId: string,
    state: 'active' | 'deleted' = 'active',
  ): Promise<ChatRow | undefined> {
    const [row] = await tx
      .select()
      .from(c)
      .where(
        and(
          eq(c.organizationId, orgId),
          eq(c.ownerUserId, userId),
          eq(c.id, chatId),
          state === 'active' ? isNull(c.deletedAt) : isNotNull(c.deletedAt),
        ),
      )
    return row
  }

  /** The row under `FOR UPDATE`, so two messages of one chat cannot interleave. */
  async lockOwned(
    tx: DbExecutor,
    orgId: string,
    userId: string,
    chatId: string,
  ): Promise<ChatRow | undefined> {
    const [row] = await tx
      .select()
      .from(c)
      .where(
        and(
          eq(c.organizationId, orgId),
          eq(c.ownerUserId, userId),
          eq(c.id, chatId),
          isNull(c.deletedAt),
        ),
      )
      .for('update')
    return row
  }

  /** Inserts a chat, or nothing when the id is taken (by anyone). */
  async insert(tx: DbExecutor, row: NewChatRow): Promise<ChatRow | undefined> {
    const [created] = await tx.insert(chats).values(row).onConflictDoNothing().returning()
    return created
  }

  async update(
    tx: DbExecutor,
    orgId: string,
    chatId: string,
    patch: ChatPatch,
  ): Promise<ChatRow | undefined> {
    const [row] = await tx
      .update(c)
      .set({ ...patch, updatedAt: new Date() })
      .where(and(eq(c.organizationId, orgId), eq(c.id, chatId)))
      .returning()
    return row
  }

  /** Message count and last message time move only in the transaction that changes messages. */
  async bumpMessages(
    tx: DbExecutor,
    orgId: string,
    chatId: string,
    change: { delta: number; lastMessageAt: Date; currentModelKey?: string },
  ): Promise<void> {
    await tx
      .update(c)
      .set({
        messageCount: sql`greatest(${c.messageCount} + ${change.delta}, 0)`,
        lastMessageAt: change.lastMessageAt,
        ...(change.currentModelKey === undefined
          ? {}
          : { currentModelKey: change.currentModelKey }),
        updatedAt: new Date(),
      })
      .where(and(eq(c.organizationId, orgId), eq(c.id, chatId)))
  }

  /**
   * The person's chats, a keyset page. `q` matches titles and the text of messages that were not
   * superseded; for a chat found by its messages only, `matchedText` is the best matching one.
   */
  async listPage(
    tx: DbExecutor,
    orgId: string,
    userId: string,
    page: { limit: number; query: ListChatsQuery; cursor?: KeysetCursor },
  ): Promise<ChatListRow[]> {
    const { query } = page
    const sort = chatSort(query.sort, query.state)
    const search =
      query.q === undefined ? undefined : sql`websearch_to_tsquery('simple', ${query.q})`
    const conditions: (SQL | undefined)[] = [
      eq(c.organizationId, orgId),
      eq(c.ownerUserId, userId),
      query.state === 'active' ? isNull(c.deletedAt) : isNotNull(c.deletedAt),
      sql`${c.messageCount} > 0`,
      folderCondition(query.folderId),
      query.isPinned === undefined ? undefined : eq(c.isPinned, query.isPinned),
      // a pinned-order page holds only pinned chats, so the sort key is never null
      sort.expression === c.pinnedAt ? eq(c.isPinned, true) : undefined,
      search === undefined
        ? undefined
        : sql`(chats.title_tsv @@ ${search} or exists (
            select 1 from chat_messages m
            where m.organization_id = chats.organization_id and m.chat_id = chats.id
              and m.status <> 'superseded' and m.search_tsv @@ ${search}))`,
      keysetAfter(sort, c.id, page.cursor),
    ]
    const matched =
      search === undefined
        ? sql<string | null>`null`
        : sql<string | null>`case when chats.title_tsv @@ ${search} then null else (
            select left(m.content_text, ${MATCHED_TEXT_MAX_CHARS}) from chat_messages m
            where m.organization_id = chats.organization_id and m.chat_id = chats.id
              and m.status <> 'superseded' and m.search_tsv @@ ${search}
            order by ts_rank(m.search_tsv, ${search}) desc, m.created_at desc limit 1) end`
    return tx
      .select({ chat: c, sortKey: keysetKey(sort), matchedText: matched })
      .from(c)
      .where(and(...conditions))
      .orderBy(...keysetOrder(sort, c.id))
      .limit(page.limit + 1)
  }

  async knowledgeBaseIds(
    tx: DbExecutor,
    orgId: string,
    chatIds: readonly string[],
  ): Promise<Map<string, string[]>> {
    const byChat = new Map<string, string[]>()
    if (chatIds.length === 0) return byChat
    const rows = await tx
      .select({ chatId: chatKnowledgeBases.chatId, id: chatKnowledgeBases.knowledgeBaseId })
      .from(chatKnowledgeBases)
      .where(
        and(
          eq(chatKnowledgeBases.organizationId, orgId),
          inArray(chatKnowledgeBases.chatId, [...chatIds]),
        ),
      )
      .orderBy(asc(chatKnowledgeBases.createdAt), asc(chatKnowledgeBases.knowledgeBaseId))
    for (const row of rows) byChat.set(row.chatId, [...(byChat.get(row.chatId) ?? []), row.id])
    return byChat
  }

  /** Replaces the selected knowledge bases of a chat in the caller's transaction. */
  async replaceKnowledgeBases(
    tx: DbExecutor,
    orgId: string,
    chatId: string,
    knowledgeBaseIds: readonly string[],
  ): Promise<void> {
    await tx
      .delete(chatKnowledgeBases)
      .where(
        and(eq(chatKnowledgeBases.organizationId, orgId), eq(chatKnowledgeBases.chatId, chatId)),
      )
    if (knowledgeBaseIds.length === 0) return
    await tx.insert(chatKnowledgeBases).values(
      [...new Set(knowledgeBaseIds)].map((knowledgeBaseId) => ({
        organizationId: orgId,
        chatId,
        knowledgeBaseId,
      })),
    )
  }

  /** Turning a chat private: its feedback never becomes Train data, now or later. */
  async markFeedbackNotEligible(tx: DbExecutor, orgId: string, chatId: string): Promise<void> {
    await tx
      .update(chatMessageFeedback)
      .set({ isTrainEligible: false })
      .where(
        and(
          eq(chatMessageFeedback.organizationId, orgId),
          inArray(
            chatMessageFeedback.messageId,
            tx
              .select({ id: chatMessages.id })
              .from(chatMessages)
              .where(and(eq(chatMessages.organizationId, orgId), eq(chatMessages.chatId, chatId))),
          ),
        ),
      )
  }

  // ── Folders ─────────────────────────────────────────────────────────────────────────────────

  async listFolders(
    tx: DbExecutor,
    orgId: string,
    userId: string,
    limit: number,
  ): Promise<{ folder: ChatFolderRow; chatCount: number }[]> {
    const counts = tx
      .select({ folderId: c.folderId, n: sql<number>`count(*)::int`.as('n') })
      .from(c)
      .where(
        and(
          eq(c.organizationId, orgId),
          eq(c.ownerUserId, userId),
          isNull(c.deletedAt),
          sql`${c.messageCount} > 0`,
          isNotNull(c.folderId),
        ),
      )
      .groupBy(c.folderId)
      .as('counts')
    const rows = await tx
      .select({ folder: f, chatCount: sql<number>`coalesce(${counts.n}, 0)::int` })
      .from(f)
      .leftJoin(counts, eq(counts.folderId, f.id))
      .where(and(eq(f.organizationId, orgId), eq(f.ownerUserId, userId)))
      .orderBy(asc(f.sortOrder), asc(f.createdAt), asc(f.id))
      .limit(limit)
    return rows
  }

  async findFolder(
    tx: DbExecutor,
    orgId: string,
    userId: string,
    folderId: string,
  ): Promise<ChatFolderRow | undefined> {
    const [row] = await tx
      .select()
      .from(f)
      .where(and(eq(f.organizationId, orgId), eq(f.ownerUserId, userId), eq(f.id, folderId)))
    return row
  }

  async countFolders(tx: DbExecutor, orgId: string, userId: string): Promise<number> {
    const [row] = await tx
      .select({ n: sql<number>`count(*)::int` })
      .from(f)
      .where(and(eq(f.organizationId, orgId), eq(f.ownerUserId, userId)))
    return row?.n ?? 0
  }

  async folderNameTaken(
    tx: DbExecutor,
    orgId: string,
    userId: string,
    name: string,
    exceptId?: string,
  ): Promise<boolean> {
    const [row] = await tx
      .select({ id: f.id })
      .from(f)
      .where(
        and(
          eq(f.organizationId, orgId),
          eq(f.ownerUserId, userId),
          sql`lower(${f.name}) = lower(${name})`,
          exceptId === undefined ? undefined : ne(f.id, exceptId),
        ),
      )
    return row !== undefined
  }

  async insertFolder(
    tx: DbExecutor,
    orgId: string,
    userId: string,
    name: string,
    sortOrder: number,
  ): Promise<ChatFolderRow> {
    const [row] = await tx
      .insert(f)
      .values({ organizationId: orgId, ownerUserId: userId, name, sortOrder })
      .returning()
    if (row === undefined) throw new Error('chat folder insert returned no row')
    return row
  }

  async renameFolder(
    tx: DbExecutor,
    orgId: string,
    folderId: string,
    name: string,
  ): Promise<ChatFolderRow | undefined> {
    const [row] = await tx
      .update(f)
      .set({ name, updatedAt: new Date() })
      .where(and(eq(f.organizationId, orgId), eq(f.id, folderId)))
      .returning()
    return row
  }

  /** A hard delete: the chats of the folder keep their rows and return to the list (`set null`). */
  async deleteFolder(tx: DbExecutor, orgId: string, folderId: string): Promise<void> {
    await tx.delete(f).where(and(eq(f.organizationId, orgId), eq(f.id, folderId)))
  }

  async setFolderOrder(
    tx: DbExecutor,
    orgId: string,
    userId: string,
    folderIds: readonly string[],
  ): Promise<void> {
    for (const [index, folderId] of folderIds.entries()) {
      await tx
        .update(f)
        .set({ sortOrder: index, updatedAt: new Date() })
        .where(and(eq(f.organizationId, orgId), eq(f.ownerUserId, userId), eq(f.id, folderId)))
    }
  }

  async folderIds(tx: DbExecutor, orgId: string, userId: string): Promise<string[]> {
    const rows = await tx
      .select({ id: f.id })
      .from(f)
      .where(and(eq(f.organizationId, orgId), eq(f.ownerUserId, userId)))
    return rows.map((row) => row.id)
  }
}
