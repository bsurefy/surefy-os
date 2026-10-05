// SPDX-License-Identifier: AGPL-3.0-only
import { BadRequestError } from '@/core/errors/index.js'
import { decodeCursor, toPage } from '@/lib/pagination.js'
import { CHAT_FOLDERS_MAX } from '@surefy/contracts'
import type {
  ChatDto,
  ChatFolderDto,
  CreateChatFolderInput,
  ListChatsQuery,
  ReorderChatFoldersInput,
  UpdateChatFolderInput,
  UpdateChatInput,
} from '@surefy/contracts'

import { requireUser } from './chatContext.js'
import {
  ChatFolderNameTakenError,
  ChatFolderNotFoundError,
  ChatNotFoundError,
} from './chats.errors.js'
import { toChatDto, toFolderDto } from './chats.mapper.js'
import { isRestorable } from './chats.utils.js'
import { assertModelUsable, resolveSettings } from './chatSettings.js'

import type { ChatRow } from './chats.mapper.js'
import type { ChatsRepository } from './chats.repository.js'
import type { ChatModels } from './chats.types.js'
import type { Database, DbExecutor } from '@/core/database/index.js'
import type { TenantContext } from '@/types/context.js'

export interface ChatsServiceDeps {
  db: Database
  repository: ChatsRepository
  models: ChatModels
}

/**
 * A person's chats and folders. Every read and write names the owner, so another person's chat
 * (or another organization's) is a 404 that reveals nothing.
 */
export class ChatsService {
  constructor(private readonly deps: ChatsServiceDeps) {}

  // ── Chats ───────────────────────────────────────────────────────────────────────────────────

  async list(
    ctx: TenantContext,
    query: ListChatsQuery,
  ): Promise<{ items: ChatDto[]; nextCursor: string | null }> {
    const userId = requireUser(ctx)
    const { repository } = this.deps
    return this.deps.db.tenant(ctx.orgId, async (tx) => {
      const rows = await repository.listPage(tx, ctx.orgId, userId, {
        limit: query.limit,
        query,
        ...(query.cursor === undefined ? {} : { cursor: decodeCursor(query.cursor) }),
      })
      const page = toPage(rows, query.limit, (row) => ({ k: row.sortKey, id: row.chat.id }))
      const selected = await repository.knowledgeBaseIds(
        tx,
        ctx.orgId,
        page.items
          .filter((row) => row.chat.knowledgeScope === 'selected')
          .map((row) => row.chat.id),
      )
      return {
        items: page.items.map((row) =>
          toChatDto(row.chat, {
            knowledgeBaseIds: selected.get(row.chat.id) ?? [],
            matchedText: row.matchedText,
          }),
        ),
        nextCursor: page.nextCursor,
      }
    })
  }

  async get(ctx: TenantContext, chatId: string): Promise<ChatDto> {
    const userId = requireUser(ctx)
    return this.deps.db.tenant(ctx.orgId, async (tx) => {
      const row = await this.deps.repository.findOwned(tx, ctx.orgId, userId, chatId)
      if (row === undefined) throw new ChatNotFoundError()
      return this.toDto(tx, ctx.orgId, row)
    })
  }

  async update(ctx: TenantContext, chatId: string, input: UpdateChatInput): Promise<ChatDto> {
    const userId = requireUser(ctx)
    const { repository } = this.deps
    return this.deps.db.tenant(ctx.orgId, async (tx) => {
      const current = await repository.lockOwned(tx, ctx.orgId, userId, chatId)
      if (current === undefined) throw new ChatNotFoundError()
      const settings = await resolveSettings(this.deps, tx, ctx, userId, input, current)
      const patch = settings.patch
      if (input.title !== undefined) {
        patch.title = input.title
        patch.titleGenerated = false // a manual rename stops regeneration
      }
      if (input.isPinned !== undefined) {
        patch.isPinned = input.isPinned
        patch.pinnedAt = input.isPinned ? (current.pinnedAt ?? new Date()) : null
      }
      if (input.currentModelKey !== undefined) {
        await assertModelUsable(this.deps, tx, ctx, input.currentModelKey, {
          isPrivate: patch.isPrivate ?? current.isPrivate,
        })
        patch.currentModelKey = input.currentModelKey
      }
      const updated = await repository.update(tx, ctx.orgId, chatId, patch)
      if (updated === undefined) throw new ChatNotFoundError()
      if (settings.knowledgeBaseIds !== undefined) {
        await repository.replaceKnowledgeBases(tx, ctx.orgId, chatId, settings.knowledgeBaseIds)
      }
      if (settings.turnedPrivate) await repository.markFeedbackNotEligible(tx, ctx.orgId, chatId)
      return this.toDto(tx, ctx.orgId, updated)
    })
  }

  /** Moves the chat to Recently deleted; nothing else changes, so a restore is exact. */
  async delete(ctx: TenantContext, chatId: string): Promise<void> {
    const userId = requireUser(ctx)
    await this.deps.db.tenant(ctx.orgId, async (tx) => {
      const current = await this.deps.repository.lockOwned(tx, ctx.orgId, userId, chatId)
      if (current === undefined) throw new ChatNotFoundError()
      await this.deps.repository.update(tx, ctx.orgId, chatId, {
        deletedAt: new Date(),
        deletedByUserId: userId,
      })
    })
  }

  /** Within 30 days of the delete; after that the chat is gone for good and answers 404. */
  async restore(ctx: TenantContext, chatId: string): Promise<ChatDto> {
    const userId = requireUser(ctx)
    const { repository } = this.deps
    return this.deps.db.tenant(ctx.orgId, async (tx) => {
      const current = await repository.findOwned(tx, ctx.orgId, userId, chatId, 'deleted')
      if (current?.deletedAt == null || !isRestorable(current.deletedAt)) {
        throw new ChatNotFoundError()
      }
      // the folder may have been deleted meanwhile: `set null` already returned the chat to the list
      const restored = await repository.update(tx, ctx.orgId, chatId, {
        deletedAt: null,
        deletedByUserId: null,
      })
      if (restored === undefined) throw new ChatNotFoundError()
      return this.toDto(tx, ctx.orgId, restored)
    })
  }

  private async toDto(tx: DbExecutor, orgId: string, row: ChatRow): Promise<ChatDto> {
    const selected =
      row.knowledgeScope === 'selected'
        ? ((await this.deps.repository.knowledgeBaseIds(tx, orgId, [row.id])).get(row.id) ?? [])
        : []
    return toChatDto(row, { knowledgeBaseIds: selected })
  }

  // ── Folders ─────────────────────────────────────────────────────────────────────────────────

  /** A person has at most `CHAT_FOLDERS_MAX` folders, so the list is one page. */
  async listFolders(ctx: TenantContext): Promise<{ items: ChatFolderDto[]; nextCursor: null }> {
    const userId = requireUser(ctx)
    return this.deps.db.tenant(ctx.orgId, async (tx) => {
      const rows = await this.deps.repository.listFolders(tx, ctx.orgId, userId, CHAT_FOLDERS_MAX)
      return {
        items: rows.map(({ folder, chatCount }) => toFolderDto(folder, chatCount)),
        nextCursor: null,
      }
    })
  }

  async createFolder(ctx: TenantContext, input: CreateChatFolderInput): Promise<ChatFolderDto> {
    const userId = requireUser(ctx)
    const { repository } = this.deps
    return this.deps.db.tenant(ctx.orgId, async (tx) => {
      if ((await repository.countFolders(tx, ctx.orgId, userId)) >= CHAT_FOLDERS_MAX) {
        throw new BadRequestError(undefined, `At most ${CHAT_FOLDERS_MAX} folders`)
      }
      if (await repository.folderNameTaken(tx, ctx.orgId, userId, input.name)) {
        throw new ChatFolderNameTakenError()
      }
      const sortOrder = await repository.countFolders(tx, ctx.orgId, userId)
      return toFolderDto(
        await repository.insertFolder(tx, ctx.orgId, userId, input.name, sortOrder),
        0,
      )
    })
  }

  async renameFolder(
    ctx: TenantContext,
    folderId: string,
    input: UpdateChatFolderInput,
  ): Promise<ChatFolderDto> {
    const userId = requireUser(ctx)
    const { repository } = this.deps
    return this.deps.db.tenant(ctx.orgId, async (tx) => {
      const folder = await repository.findFolder(tx, ctx.orgId, userId, folderId)
      if (folder === undefined) throw new ChatFolderNotFoundError()
      if (await repository.folderNameTaken(tx, ctx.orgId, userId, input.name, folderId)) {
        throw new ChatFolderNameTakenError()
      }
      const renamed = await repository.renameFolder(tx, ctx.orgId, folderId, input.name)
      if (renamed === undefined) throw new ChatFolderNotFoundError()
      const rows = await repository.listFolders(tx, ctx.orgId, userId, CHAT_FOLDERS_MAX)
      const count = rows.find((row) => row.folder.id === folderId)?.chatCount ?? 0
      return toFolderDto(renamed, count)
    })
  }

  /** A hard delete: the folder's chats return to the list. */
  async deleteFolder(ctx: TenantContext, folderId: string): Promise<void> {
    const userId = requireUser(ctx)
    await this.deps.db.tenant(ctx.orgId, async (tx) => {
      const folder = await this.deps.repository.findFolder(tx, ctx.orgId, userId, folderId)
      if (folder === undefined) throw new ChatFolderNotFoundError()
      await this.deps.repository.deleteFolder(tx, ctx.orgId, folderId)
    })
  }

  /** `folderIds` must be every folder of the person, once, in the new order. */
  async reorderFolders(
    ctx: TenantContext,
    input: ReorderChatFoldersInput,
  ): Promise<{ items: ChatFolderDto[]; nextCursor: null }> {
    const userId = requireUser(ctx)
    const { repository } = this.deps
    await this.deps.db.tenant(ctx.orgId, async (tx) => {
      const existing = await repository.folderIds(tx, ctx.orgId, userId)
      const given = new Set(input.folderIds)
      if (given.size !== input.folderIds.length || existing.length !== given.size) {
        throw new BadRequestError(undefined, 'Send every folder once')
      }
      if (existing.some((id) => !given.has(id))) throw new ChatFolderNotFoundError()
      await repository.setFolderOrder(tx, ctx.orgId, userId, input.folderIds)
    })
    return this.listFolders(ctx)
  }
}
