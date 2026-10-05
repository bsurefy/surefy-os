// SPDX-License-Identifier: AGPL-3.0-only
import { and, asc, desc, eq, gt, inArray, lt, ne, or, sql, type SQL } from 'drizzle-orm'

import { chatMessageCitations, chatMessageFeedback, chatMessages } from '@/database/tables/index.js'
import {
  keysetAfter,
  keysetKey,
  keysetOrder,
  parseSort,
  type KeysetCursor,
  type KeysetSort,
} from '@/lib/pagination.js'
import type { ChatFeedbackRating, SourcePart } from '@surefy/contracts'

import type { ChatFeedbackRow, ChatMessageRow } from './chats.mapper.js'
import type { DbExecutor } from '@/core/database/index.js'

const m = chatMessages

export type NewChatMessageRow = typeof chatMessages.$inferInsert

/** What the end of a stream, a checkpoint or a sweep writes onto a message. */
export type ChatMessagePatch = Partial<
  Pick<
    ChatMessageRow,
    | 'status'
    | 'parts'
    | 'contentText'
    | 'modelKey'
    | 'vaultModelId'
    | 'inputTokens'
    | 'outputTokens'
    | 'cachedInputTokens'
    | 'reasoningTokens'
    | 'costMicros'
    | 'currency'
    | 'latencyMs'
    | 'timeToFirstTokenMs'
    | 'dataLocation'
    | 'piiMasked'
    | 'routed'
    | 'errorCode'
  >
>

const messageSort = (sort: string | undefined): KeysetSort => {
  const { descending } = parseSort<'createdAt'>(sort, 'createdAt')
  return { expression: m.createdAt, cast: 'timestamptz', descending }
}

/** `chat_messages`, `chat_message_citations` and `chat_message_feedback`. */
export class ChatMessagesRepository {
  /** A page of the thread: messages that were not superseded, oldest first by default. */
  listPage(
    tx: DbExecutor,
    orgId: string,
    chatId: string,
    page: { limit: number; sort: string | undefined; cursor?: KeysetCursor },
  ) {
    const sort = messageSort(page.sort)
    return tx
      .select({ message: m, sortKey: keysetKey(sort) })
      .from(m)
      .where(
        and(
          eq(m.organizationId, orgId),
          eq(m.chatId, chatId),
          ne(m.status, 'superseded'),
          keysetAfter(sort, m.id, page.cursor),
        ),
      )
      .orderBy(...keysetOrder(sort, m.id))
      .limit(page.limit + 1)
  }

  /** The whole conversation the model sees, oldest first (messages that were not superseded). */
  thread(tx: DbExecutor, orgId: string, chatId: string): Promise<ChatMessageRow[]> {
    return tx
      .select()
      .from(m)
      .where(and(eq(m.organizationId, orgId), eq(m.chatId, chatId), ne(m.status, 'superseded')))
      .orderBy(asc(m.createdAt), asc(m.id))
  }

  async find(
    tx: DbExecutor,
    orgId: string,
    chatId: string,
    messageId: string,
  ): Promise<ChatMessageRow | undefined> {
    const [row] = await tx
      .select()
      .from(m)
      .where(and(eq(m.organizationId, orgId), eq(m.chatId, chatId), eq(m.id, messageId)))
    return row
  }

  async insert(tx: DbExecutor, row: NewChatMessageRow): Promise<ChatMessageRow> {
    const [created] = await tx.insert(m).values(row).returning()
    if (created === undefined) throw new Error('chat message insert returned no row')
    return created
  }

  async update(
    tx: DbExecutor,
    orgId: string,
    messageId: string,
    patch: ChatMessagePatch,
  ): Promise<void> {
    await tx
      .update(m)
      .set({ ...patch, updatedAt: new Date() })
      .where(and(eq(m.organizationId, orgId), eq(m.id, messageId)))
  }

  /** Marks the messages superseded and returns how many changed (the chat's count shrinks by it). */
  async supersede(tx: DbExecutor, orgId: string, messageIds: readonly string[]): Promise<number> {
    if (messageIds.length === 0) return 0
    const rows = await tx
      .update(m)
      .set({ status: 'superseded', updatedAt: new Date() })
      .where(
        and(
          eq(m.organizationId, orgId),
          inArray(m.id, [...messageIds]),
          ne(m.status, 'superseded'),
        ),
      )
      .returning({ id: m.id })
    return rows.length
  }

  /** The message and every later one in the chat, for edit and resend. */
  async fromMessage(
    tx: DbExecutor,
    orgId: string,
    chatId: string,
    target: Pick<ChatMessageRow, 'id' | 'createdAt'>,
  ): Promise<ChatMessageRow[]> {
    return tx
      .select()
      .from(m)
      .where(
        and(
          eq(m.organizationId, orgId),
          eq(m.chatId, chatId),
          ne(m.status, 'superseded'),
          or(
            gt(m.createdAt, target.createdAt),
            and(eq(m.createdAt, target.createdAt), sql`${m.id} >= ${target.id}`),
          ),
        ),
      )
  }

  /** Whether an answer of this chat is still streaming. */
  async hasStreaming(tx: DbExecutor, orgId: string, chatId: string): Promise<boolean> {
    const [row] = await tx
      .select({ id: m.id })
      .from(m)
      .where(and(eq(m.organizationId, orgId), eq(m.chatId, chatId), eq(m.status, 'streaming')))
      .limit(1)
    return row !== undefined
  }

  /**
   * `streaming → interrupted` for answers not updated since `before`; scoped to one chat (the
   * next read of the chat) or to everything (the maintenance sweep, under system scope).
   */
  async interruptStale(
    tx: DbExecutor,
    before: Date,
    errorCode: string,
    scope: { orgId: string; chatId: string } | null,
  ): Promise<number> {
    const conditions: (SQL | undefined)[] = [
      eq(m.status, 'streaming'),
      lt(m.updatedAt, before),
      scope === null ? undefined : eq(m.organizationId, scope.orgId),
      scope === null ? undefined : eq(m.chatId, scope.chatId),
    ]
    const rows = await tx
      .update(m)
      .set({ status: 'interrupted', errorCode, updatedAt: new Date() })
      .where(and(...conditions))
      .returning({ id: m.id })
    return rows.length
  }

  // ── Citations ───────────────────────────────────────────────────────────────────────────────

  async insertCitations(
    tx: DbExecutor,
    orgId: string,
    messageId: string,
    sources: readonly SourcePart[],
  ): Promise<void> {
    const knowledge = sources.filter((source) => source.kind === 'knowledge')
    if (knowledge.length === 0) return
    await tx
      .insert(chatMessageCitations)
      .values(
        knowledge.map((source) => ({
          organizationId: orgId,
          messageId,
          knowledgeBaseId: source.knowledgeBaseId ?? null,
          knowledgeDocumentId: source.documentId ?? null,
          chunkId: source.chunkId ?? null,
          page: source.page ?? null,
          rank: source.index,
        })),
      )
      .onConflictDoNothing()
  }

  // ── Feedback ────────────────────────────────────────────────────────────────────────────────

  async feedbackOf(
    tx: DbExecutor,
    orgId: string,
    userId: string,
    messageIds: readonly string[],
  ): Promise<Map<string, ChatFeedbackRow>> {
    if (messageIds.length === 0) return new Map()
    const rows = await tx
      .select()
      .from(chatMessageFeedback)
      .where(
        and(
          eq(chatMessageFeedback.organizationId, orgId),
          eq(chatMessageFeedback.userId, userId),
          inArray(chatMessageFeedback.messageId, [...messageIds]),
        ),
      )
    return new Map(rows.map((row) => [row.messageId, row]))
  }

  async upsertFeedback(
    tx: DbExecutor,
    row: {
      orgId: string
      messageId: string
      userId: string
      rating: ChatFeedbackRating
      correctionText: string | null
      isTrainEligible: boolean
    },
  ): Promise<ChatFeedbackRow> {
    const values = {
      organizationId: row.orgId,
      messageId: row.messageId,
      userId: row.userId,
      rating: row.rating,
      correctionText: row.correctionText,
      isTrainEligible: row.isTrainEligible,
    }
    const [saved] = await tx
      .insert(chatMessageFeedback)
      .values(values)
      .onConflictDoUpdate({
        target: [
          chatMessageFeedback.organizationId,
          chatMessageFeedback.messageId,
          chatMessageFeedback.userId,
        ],
        set: {
          rating: values.rating,
          correctionText: values.correctionText,
          isTrainEligible: values.isTrainEligible,
          updatedAt: new Date(),
        },
      })
      .returning()
    if (saved === undefined) throw new Error('chat feedback upsert returned no row')
    return saved
  }

  async deleteFeedback(
    tx: DbExecutor,
    orgId: string,
    userId: string,
    messageId: string,
  ): Promise<void> {
    await tx
      .delete(chatMessageFeedback)
      .where(
        and(
          eq(chatMessageFeedback.organizationId, orgId),
          eq(chatMessageFeedback.userId, userId),
          eq(chatMessageFeedback.messageId, messageId),
        ),
      )
  }

  /** The latest answer's model, which a model switch is measured against. */
  async lastAnswerModel(tx: DbExecutor, orgId: string, chatId: string): Promise<string | null> {
    const [row] = await tx
      .select({ modelKey: m.modelKey })
      .from(m)
      .where(
        and(
          eq(m.organizationId, orgId),
          eq(m.chatId, chatId),
          eq(m.role, 'assistant'),
          ne(m.status, 'superseded'),
          sql`${m.modelKey} is not null`,
        ),
      )
      .orderBy(desc(m.createdAt), desc(m.id))
      .limit(1)
    return row?.modelKey ?? null
  }
}
