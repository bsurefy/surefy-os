// SPDX-License-Identifier: AGPL-3.0-only
import { ChatNotFoundError } from './chats.errors.js'

import type { ChatRow } from './chats.mapper.js'
import type { ChatsRepository } from './chats.repository.js'
import type { ChatOrganizations } from './chats.types.js'
import type { ChatSharesRepository, SharedChatRow } from './chatShares.repository.js'
import type { DbExecutor } from '@/core/database/index.js'
import type { TenantContext } from '@/types/context.js'

export interface ChatReadersDeps {
  chats: ChatsRepository
  shares: ChatSharesRepository
  organizations: ChatOrganizations
}

/** A chat someone may read: their own, or one shared with them or one of their teams. */
export type ReadableChat =
  { chat: ChatRow; owner: true } | { chat: ChatRow; owner: false; share: SharedChatRow }

/**
 * Who may read a chat's thread (chat.md §8): the owner, and the people a share reaches while the
 * organization allows sharing and the chat is neither deleted nor private. Anyone else gets the
 * same CHAT_NOT_FOUND as for a chat that does not exist.
 */
export class ChatReaders {
  constructor(private readonly deps: ChatReadersDeps) {}

  async readable(
    tx: DbExecutor,
    ctx: TenantContext,
    userId: string,
    chatId: string,
  ): Promise<ReadableChat> {
    const own = await this.deps.chats.findOwned(tx, ctx.orgId, userId, chatId)
    if (own !== undefined) return { chat: own, owner: true }
    const share = await this.shared(tx, ctx, userId, chatId)
    if (share === undefined) throw new ChatNotFoundError()
    return { chat: share.chat, owner: false, share }
  }

  /** The chat through a share only; undefined while sharing is off. */
  async shared(
    tx: DbExecutor,
    ctx: TenantContext,
    userId: string,
    chatId: string,
  ): Promise<SharedChatRow | undefined> {
    if (!(await this.deps.organizations.sharingEnabledInTx(tx, ctx.orgId))) return undefined
    return this.deps.shares.findShared(tx, ctx.orgId, { userId, teamIds: ctx.teamIds }, chatId)
  }
}
