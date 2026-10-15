// SPDX-License-Identifier: AGPL-3.0-only
import { BadRequestError } from '@/core/errors/index.js'
import { decodeCursor, toPage } from '@/lib/pagination.js'
import { CHAT_AUDIT_ACTIONS, CHAT_SHARES_MAX } from '@surefy/contracts'
import type {
  ChatAgentRefDto,
  ChatSharedParams,
  ChatShareTargetDto,
  ChatShareDto,
  ChatSharesDto,
  CreateChatSharesInput,
  ListChatShareTargetsQuery,
  ListSharedChatsQuery,
  SharedChatDetailDto,
  SharedChatDto,
  UserRefDto,
} from '@surefy/contracts'

import { requireUser } from './chatContext.js'
import {
  ChatNotFoundError,
  ChatPrivateNotShareableError,
  ChatShareNotFoundError,
  ChatShareTargetNotFoundError,
  ChatSharingDisabledError,
} from './chats.errors.js'

import type { ChatReaders } from './chatReaders.js'
import type { ChatRow } from './chats.mapper.js'
import type { ChatsRepository } from './chats.repository.js'
import type {
  ChatAgentRuns,
  ChatAudit,
  ChatNotifications,
  ChatOrganizations,
  ChatUserRefs,
} from './chats.types.js'
import type {
  ChatShareListRow,
  ChatShareRow,
  ChatSharesRepository,
  NewChatShareRow,
  SharedChatRow,
} from './chatShares.repository.js'
import type { Database, DbExecutor } from '@/core/database/index.js'
import type { Logger } from '@/core/logger/index.js'
import type { TenantContext } from '@/types/context.js'

export interface ChatSharesServiceDeps {
  db: Database
  chats: ChatsRepository
  shares: ChatSharesRepository
  readers: ChatReaders
  agents: ChatAgentRuns
  organizations: ChatOrganizations
  users: ChatUserRefs
  notifications: ChatNotifications
  audit: ChatAudit
  logger: Logger
}

/** Who a new share tells: each person once, with the team it reached them through. */
interface Recipient {
  userId: string
  shareId: string
  teamName: string | null
}

const iso = (date: Date): string => date.toISOString()

/**
 * Shared chats (chat.md §8): the owner shares a chat view only with people and teams of the
 * organization; "Shared with me" and the view-only header for the people it reaches.
 */
export class ChatSharesService {
  constructor(private readonly deps: ChatSharesServiceDeps) {}

  // ── The owner ───────────────────────────────────────────────────────────────────────────────

  async list(ctx: TenantContext, chatId: string): Promise<ChatSharesDto> {
    const userId = requireUser(ctx)
    const found = await this.deps.db.tenant(ctx.orgId, async (tx) => {
      const chat = await this.owned(tx, ctx.orgId, userId, chatId)
      return this.read(tx, ctx.orgId, chat)
    })
    return this.present(found)
  }

  /** Subjects that already have a share are left as they are; new ones are told after the commit. */
  async create(
    ctx: TenantContext,
    chatId: string,
    input: CreateChatSharesInput,
  ): Promise<ChatSharesDto> {
    const userId = requireUser(ctx)
    const { shares } = this.deps
    const result = await this.deps.db.tenant(ctx.orgId, async (tx) => {
      const chat = await this.owned(tx, ctx.orgId, userId, chatId, { lock: true })
      if (!(await this.deps.organizations.sharingEnabledInTx(tx, ctx.orgId))) {
        throw new ChatSharingDisabledError()
      }
      if (chat.isPrivate) throw new ChatPrivateNotShareableError()
      const { rows, teamNames } = await this.newRows(tx, ctx.orgId, chat, input, userId)
      if ((await shares.count(tx, ctx.orgId, chatId)) + rows.length > CHAT_SHARES_MAX) {
        throw new BadRequestError(undefined, `A chat is shared with at most ${CHAT_SHARES_MAX}`)
      }
      const created = await shares.insert(tx, rows)
      if (created.length > 0) {
        await this.deps.audit.record(tx, ctx, {
          action: CHAT_AUDIT_ACTIONS.CHAT_SHARED,
          target: { type: 'chat', id: chatId },
          metadata: subjectsMetadata(created),
        })
      }
      const recipients = await this.recipientsOf(tx, ctx.orgId, chat, created, teamNames)
      return { read: await this.read(tx, ctx.orgId, chat), chat, recipients }
    })
    await this.tell(ctx, result.chat, result.recipients, userId)
    return this.present(result.read)
  }

  /** Unsharing deletes the row; it works while sharing is off, too. */
  async remove(ctx: TenantContext, chatId: string, shareId: string): Promise<void> {
    const userId = requireUser(ctx)
    await this.deps.db.tenant(ctx.orgId, async (tx) => {
      await this.owned(tx, ctx.orgId, userId, chatId)
      const share = await this.deps.shares.find(tx, ctx.orgId, chatId, shareId)
      if (share === undefined) throw new ChatShareNotFoundError()
      await this.deps.shares.delete(tx, ctx.orgId, share.id)
      await this.deps.audit.record(tx, ctx, {
        action: CHAT_AUDIT_ACTIONS.CHAT_UNSHARED,
        target: { type: 'chat', id: chatId },
        metadata: subjectsMetadata([share]),
      })
    })
  }

  // ── The people it is shared with ────────────────────────────────────────────────────────────

  /** "Shared with me": empty while the organization does not allow sharing. */
  async listShared(
    ctx: TenantContext,
    query: ListSharedChatsQuery,
  ): Promise<{ items: SharedChatDto[]; nextCursor: string | null }> {
    const userId = requireUser(ctx)
    const page = await this.deps.db.tenant(ctx.orgId, async (tx) => {
      if (!(await this.deps.organizations.sharingEnabledInTx(tx, ctx.orgId))) {
        return { items: [], nextCursor: null }
      }
      const rows = await this.deps.shares.listShared(
        tx,
        ctx.orgId,
        { userId, teamIds: ctx.teamIds },
        {
          limit: query.limit,
          ...(query.cursor === undefined ? {} : { cursor: decodeCursor(query.cursor) }),
        },
      )
      return toPage(rows, query.limit, (row) => ({ k: row.sortKey, id: row.chat.id }))
    })
    const refs = await this.deps.users.findUserRefs(page.items.map((row) => row.chat.ownerUserId))
    return {
      items: page.items.map((row) => ({
        id: row.chat.id,
        title: row.chat.title,
        owner: refs.get(row.chat.ownerUserId) ?? null,
        lastMessageAt: row.chat.lastMessageAt === null ? null : iso(row.chat.lastMessageAt),
        sharedAt: iso(row.sharedAt),
      })),
      nextCursor: page.nextCursor,
    }
  }

  /** The view-only header of a shared chat; the owner's own settings are not part of it. */
  async getShared(ctx: TenantContext, chatId: string): Promise<SharedChatDetailDto> {
    const userId = requireUser(ctx)
    const found = await this.deps.db.tenant(ctx.orgId, async (tx) => {
      const share = await this.deps.readers.shared(tx, ctx, userId, chatId)
      if (share === undefined) throw new ChatNotFoundError()
      const { agentId } = share.chat
      const agent =
        agentId === null
          ? null
          : ((await this.deps.agents.refs(tx, ctx, [agentId])).get(agentId) ?? null)
      return { share, agent }
    })
    return this.presentShared(found.share, found.agent)
  }

  /** The people and teams the share dialog can pick; CHAT_SHARING_DISABLED while sharing is off. */
  async targets(
    ctx: TenantContext,
    query: ListChatShareTargetsQuery,
  ): Promise<{ items: ChatShareTargetDto[]; nextCursor: string | null }> {
    const userId = requireUser(ctx)
    const page = await this.deps.db.tenant(ctx.orgId, async (tx) => {
      if (!(await this.deps.organizations.sharingEnabledInTx(tx, ctx.orgId))) {
        throw new ChatSharingDisabledError()
      }
      const rows = await this.deps.shares.targets(tx, ctx.orgId, userId, {
        limit: query.limit,
        ...(query.q === undefined ? {} : { q: query.q }),
        ...(query.cursor === undefined ? {} : { cursor: decodeCursor(query.cursor) }),
      })
      return toPage(rows, query.limit, (row) => ({ k: row.sortKey, id: row.id }))
    })
    const refs = await this.deps.users.findUserRefs(
      page.items.flatMap((row) => (row.subjectType === 'user' ? [row.id] : [])),
    )
    return {
      items: page.items.flatMap((row): ChatShareTargetDto[] => {
        if (row.subjectType === 'team') {
          return [
            {
              subjectType: 'team',
              team: { id: row.id, name: row.name, memberCount: row.memberCount },
            },
          ]
        }
        const user = refs.get(row.id)
        return user === undefined ? [] : [{ subjectType: 'user', user }]
      }),
      nextCursor: page.nextCursor,
    }
  }

  // ── Private ─────────────────────────────────────────────────────────────────────────────────

  private async owned(
    tx: DbExecutor,
    orgId: string,
    userId: string,
    chatId: string,
    options: { lock?: boolean } = {},
  ): Promise<ChatRow> {
    const chat =
      options.lock === true
        ? await this.deps.chats.lockOwned(tx, orgId, userId, chatId)
        : await this.deps.chats.findOwned(tx, orgId, userId, chatId)
    // an empty chat is not stored as far as anyone can tell
    if (chat === undefined || chat.messageCount === 0) throw new ChatNotFoundError()
    return chat
  }

  /** The rows to insert: people who are active members (not the owner) and teams of the organization. */
  private async newRows(
    tx: DbExecutor,
    orgId: string,
    chat: ChatRow,
    input: CreateChatSharesInput,
    sharedByUserId: string,
  ): Promise<{ rows: NewChatShareRow[]; teamNames: Map<string, string> }> {
    const userIds = [
      ...new Set(input.subjects.flatMap((s) => (s.subjectType === 'user' ? [s.userId] : []))),
    ]
    const teamIds = [
      ...new Set(input.subjects.flatMap((s) => (s.subjectType === 'team' ? [s.teamId] : []))),
    ]
    const members = await this.deps.shares.activeMembers(tx, orgId, userIds)
    if (userIds.some((id) => !members.has(id))) throw new ChatShareTargetNotFoundError('userId')
    const teamNames = await this.deps.shares.teams(tx, orgId, teamIds)
    if (teamIds.some((id) => !teamNames.has(id))) throw new ChatShareTargetNotFoundError('teamId')
    const base = { organizationId: orgId, chatId: chat.id, sharedByUserId }
    const rows: NewChatShareRow[] = [
      // the owner always reads their own chat: a share with them would mean nothing
      ...userIds
        .filter((id) => id !== chat.ownerUserId)
        .map((userId) => ({ ...base, subjectType: 'user' as const, userId })),
      ...teamIds.map((teamId) => ({ ...base, subjectType: 'team' as const, teamId })),
    ]
    return { rows, teamNames }
  }

  /** Each new person, and each member of a new team, once; never the owner. */
  private async recipientsOf(
    tx: DbExecutor,
    orgId: string,
    chat: ChatRow,
    created: readonly ChatShareRow[],
    teamNames: ReadonlyMap<string, string>,
  ): Promise<Recipient[]> {
    const recipients = new Map<string, Recipient>()
    for (const share of created) {
      if (share.userId !== null) {
        recipients.set(share.userId, { userId: share.userId, shareId: share.id, teamName: null })
      }
    }
    const teamIds = created.flatMap((share) => (share.teamId === null ? [] : [share.teamId]))
    const byTeam = await this.deps.shares.teamMembers(tx, orgId, teamIds)
    for (const share of created) {
      if (share.teamId === null) continue
      for (const userId of byTeam.get(share.teamId) ?? []) {
        if (recipients.has(userId)) continue
        recipients.set(userId, {
          userId,
          shareId: share.id,
          teamName: teamNames.get(share.teamId) ?? null,
        })
      }
    }
    recipients.delete(chat.ownerUserId)
    return [...recipients.values()]
  }

  /** `chat.shared` for each recipient, after the commit; a failed notification never undoes a share. */
  private async tell(
    ctx: TenantContext,
    chat: ChatRow,
    recipients: readonly Recipient[],
    actorUserId: string,
  ): Promise<void> {
    for (const recipient of recipients) {
      const params: ChatSharedParams = {
        version: 1,
        chatTitle: chat.title,
        teamName: recipient.teamName,
      }
      try {
        await this.deps.notifications.notify(
          { orgId: ctx.orgId },
          {
            userId: recipient.userId,
            type: 'chat.shared',
            params,
            target: { type: 'chat', id: chat.id },
            actorUserId,
            dedupeKey: `chat.shared:${recipient.shareId}`,
          },
        )
      } catch (error) {
        this.deps.logger.warn({ err: error, chatId: chat.id }, 'chat.shared not notified')
      }
    }
  }

  private async read(tx: DbExecutor, orgId: string, chat: ChatRow) {
    const { shares, organizations } = this.deps
    return {
      rows: await shares.list(tx, orgId, chat.id),
      people: (await shares.peopleWithAccess(tx, orgId, chat.id, chat.ownerUserId)).length,
      sharingEnabled: await organizations.sharingEnabledInTx(tx, orgId),
    }
  }

  private async present(read: {
    rows: ChatShareListRow[]
    people: number
    sharingEnabled: boolean
  }): Promise<ChatSharesDto> {
    const refs = await this.deps.users.findUserRefs([
      ...new Set(
        read.rows.flatMap(({ share }) =>
          [share.userId, share.sharedByUserId].filter((id): id is string => id !== null),
        ),
      ),
    ])
    return {
      shares: read.rows.map((row) => toShareDto(row, refs)),
      peopleWithAccess: read.people,
      sharingEnabled: read.sharingEnabled,
    }
  }

  private async presentShared(
    share: SharedChatRow,
    agent: ChatAgentRefDto | null,
  ): Promise<SharedChatDetailDto> {
    const { chat } = share
    const refs = await this.deps.users.findUserRefs(
      [chat.ownerUserId, share.sharedByUserId].filter((id): id is string => id !== null),
    )
    return {
      id: chat.id,
      title: chat.title,
      agent,
      lastMessageAt: chat.lastMessageAt === null ? null : iso(chat.lastMessageAt),
      messageCount: chat.messageCount,
      owner: refs.get(chat.ownerUserId) ?? null,
      sharedBy: share.sharedByUserId === null ? null : (refs.get(share.sharedByUserId) ?? null),
      sharedAt: iso(share.sharedAt),
    }
  }
}

function toShareDto(row: ChatShareListRow, refs: ReadonlyMap<string, UserRefDto>): ChatShareDto {
  const { share } = row
  return {
    id: share.id,
    subjectType: share.subjectType,
    user: share.userId === null ? null : (refs.get(share.userId) ?? null),
    team:
      share.teamId === null
        ? null
        : { id: share.teamId, name: row.teamName ?? '', memberCount: row.teamMemberCount },
    sharedBy: share.sharedByUserId === null ? null : (refs.get(share.sharedByUserId) ?? null),
    createdAt: iso(share.createdAt),
  }
}

/** The people and teams of a share change, by id: never the chat's content. */
function subjectsMetadata(rows: readonly ChatShareRow[]) {
  const users = rows.flatMap((row) => (row.userId === null ? [] : [row.userId]))
  const teams = rows.flatMap((row) => (row.teamId === null ? [] : [row.teamId]))
  return {
    counts: { people: users.length, teams: teams.length },
    refs: Object.fromEntries([
      ...users.map((id, index) => [`user${String(index + 1)}`, id] as const),
      ...teams.map((id, index) => [`team${String(index + 1)}`, id] as const),
    ]),
  }
}
