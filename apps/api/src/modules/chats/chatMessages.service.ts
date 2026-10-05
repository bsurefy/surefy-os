// SPDX-License-Identifier: AGPL-3.0-only
import { decodeCursor, toPage } from '@/lib/pagination.js'
import type {
  ChatFeedbackDto,
  ChatMessageDto,
  ChatSourcePreviewDto,
  ListChatMessagesQuery,
  SetChatFeedbackInput,
  SourcePart,
} from '@surefy/contracts'

import { requireUser } from './chatContext.js'
import { INTERRUPTED_ERROR_CODE, STREAM_STALE_MS } from './chats.constants.js'
import {
  ChatFeedbackNotAllowedError,
  ChatMessageNotFoundError,
  ChatNotFoundError,
} from './chats.errors.js'
import { toFeedbackDto, toMessageDto } from './chats.mapper.js'

import type { ChatMessagesRepository } from './chatMessages.repository.js'
import type { ChatsRepository } from './chats.repository.js'
import type { ChatRetrieval } from './chats.types.js'
import type { Database, DbExecutor } from '@/core/database/index.js'
import type { TenantContext } from '@/types/context.js'

export interface ChatMessagesServiceDeps {
  db: Database
  chats: ChatsRepository
  messages: ChatMessagesRepository
  retrieval: ChatRetrieval
  now?: () => number
}

/** The thread of a chat: its messages, the person's ratings, and the source preview. */
export class ChatMessagesService {
  constructor(private readonly deps: ChatMessagesServiceDeps) {}

  /**
   * One page of the thread. Reading a chat also settles its answers that stopped streaming for
   * more than two minutes (`interrupted`), so a crash never leaves a message streaming.
   */
  async list(
    ctx: TenantContext,
    chatId: string,
    query: ListChatMessagesQuery,
  ): Promise<{ items: ChatMessageDto[]; nextCursor: string | null }> {
    const userId = requireUser(ctx)
    const { messages } = this.deps
    return this.deps.db.tenant(ctx.orgId, async (tx) => {
      await this.requireChat(tx, ctx.orgId, userId, chatId)
      await messages.interruptStale(tx, this.staleBefore(), INTERRUPTED_ERROR_CODE, {
        orgId: ctx.orgId,
        chatId,
      })
      const rows = await messages.listPage(tx, ctx.orgId, chatId, {
        limit: query.limit,
        sort: query.sort,
        ...(query.cursor === undefined ? {} : { cursor: decodeCursor(query.cursor) }),
      })
      const page = toPage(rows, query.limit, (row) => ({ k: row.sortKey, id: row.message.id }))
      const feedback = await messages.feedbackOf(
        tx,
        ctx.orgId,
        userId,
        page.items.map((row) => row.message.id),
      )
      return {
        items: page.items.map((row) =>
          toMessageDto(row.message, feedback.get(row.message.id) ?? null),
        ),
        nextCursor: page.nextCursor,
      }
    })
  }

  /** Rates a finished assistant answer; rating again replaces the rating and the correction. */
  async setFeedback(
    ctx: TenantContext,
    chatId: string,
    messageId: string,
    input: SetChatFeedbackInput,
  ): Promise<ChatFeedbackDto> {
    const userId = requireUser(ctx)
    const { messages } = this.deps
    return this.deps.db.tenant(ctx.orgId, async (tx) => {
      const chat = await this.requireChat(tx, ctx.orgId, userId, chatId)
      const message = await messages.find(tx, ctx.orgId, chatId, messageId)
      if (message === undefined || message.status === 'superseded') {
        throw new ChatMessageNotFoundError()
      }
      if (message.role !== 'assistant' || !['complete', 'stopped'].includes(message.status)) {
        throw new ChatFeedbackNotAllowedError()
      }
      const saved = await messages.upsertFeedback(tx, {
        orgId: ctx.orgId,
        messageId,
        userId,
        rating: input.rating,
        correctionText: input.correctionText ?? null,
        // content written in a private chat never becomes Train data
        isTrainEligible: !chat.isPrivate,
      })
      return toFeedbackDto(saved)
    })
  }

  async clearFeedback(ctx: TenantContext, chatId: string, messageId: string): Promise<void> {
    const userId = requireUser(ctx)
    await this.deps.db.tenant(ctx.orgId, async (tx) => {
      await this.requireChat(tx, ctx.orgId, userId, chatId)
      const message = await this.deps.messages.find(tx, ctx.orgId, chatId, messageId)
      if (message === undefined) throw new ChatMessageNotFoundError()
      await this.deps.messages.deleteFeedback(tx, ctx.orgId, userId, messageId)
    })
  }

  /**
   * The side sheet of a citation. A knowledge source is checked again for this viewer: it may
   * have been removed, or the person may have lost access, and the preview then keeps only the
   * title from the message.
   */
  async sourcePreview(
    ctx: TenantContext,
    chatId: string,
    messageId: string,
    index: number,
  ): Promise<ChatSourcePreviewDto> {
    const userId = requireUser(ctx)
    const found = await this.deps.db.tenant(ctx.orgId, async (tx) => {
      await this.requireChat(tx, ctx.orgId, userId, chatId)
      return this.deps.messages.find(tx, ctx.orgId, chatId, messageId)
    })
    const source = found?.parts.parts.find(
      (part): part is SourcePart => part.type === 'source' && part.index === index,
    )
    if (found === undefined || source === undefined) throw new ChatMessageNotFoundError()
    const preview = {
      index: source.index,
      kind: source.kind,
      title: source.title,
      page: source.page ?? null,
      url: source.url ?? null,
      knowledgeBaseId: source.knowledgeBaseId ?? null,
      documentId: source.documentId ?? null,
      chunkId: source.chunkId ?? null,
    }
    if (source.kind === 'web') {
      return { ...preview, status: 'available', passage: source.snippet, canOpenInKnowledge: false }
    }
    if (source.documentId === undefined) {
      return { ...preview, status: 'removed', passage: null, canOpenInKnowledge: false }
    }
    const check = await this.deps.retrieval.checkSource({ ctx, source })
    return { ...preview, ...check, passage: check.status === 'available' ? check.passage : null }
  }

  private async requireChat(tx: DbExecutor, orgId: string, userId: string, chatId: string) {
    const chat = await this.deps.chats.findOwned(tx, orgId, userId, chatId)
    if (chat === undefined) throw new ChatNotFoundError()
    return chat
  }

  private staleBefore(): Date {
    return new Date((this.deps.now ?? Date.now)() - STREAM_STALE_MS)
  }
}
