// SPDX-License-Identifier: AGPL-3.0-only
import { z } from 'zod'

import {
  chatSharesDtoSchema,
  chatShareTargetDtoSchema,
  createChatSharesInputSchema,
  ERROR_CODES,
  okResponse,
  pageResponse,
  sharedChatDetailDtoSchema,
  sharedChatDtoSchema,
} from '@surefy/contracts'
import type {
  ChatDto,
  ChatShareDto,
  ChatSharesDto,
  ChatShareTargetDto,
  SharedChatDetailDto,
  SharedChatDto,
  UserRefDto,
} from '@surefy/contracts'
import { fixtureUuid } from '@surefy/web-core/testing'
import { defineMockHandler, mockError, mockOk, mockPage } from '@surefy/web-core/testing/mock'

import { MAYA, OMAR } from './shell.fixtures'
import { ANA, SALES_TEAM_ID, SUPPORT_TEAM_ID } from './teams'

const SHARED_CHAT_KIND = 74
const SHARE_KIND = 75
const HTTP_FORBIDDEN = 403
const HTTP_NOT_FOUND = 404
const HTTP_UNPROCESSABLE = 422
const HOUR_MS = 3_600_000
const DAY_MS = 24 * HOUR_MS

const LEE: UserRefDto = {
  id: fixtureUuid(1, 4),
  name: 'Lee Chen',
  email: 'lee@acme.test',
  imageUrl: null,
}

/** People and teams Maya can share with: everyone active but herself, and every team. */
const SHARE_TARGETS: ChatShareTargetDto[] = [
  { subjectType: 'team', team: { id: SUPPORT_TEAM_ID, name: 'Support', memberCount: 3 } },
  { subjectType: 'team', team: { id: SALES_TEAM_ID, name: 'Sales', memberCount: 2 } },
  { subjectType: 'user', user: OMAR },
  { subjectType: 'user', user: ANA },
  { subjectType: 'user', user: LEE },
]

/** Chats others shared with Maya, one directly and one through her team. */
export const SHARED_CHAT_IDS = {
  launch: fixtureUuid(SHARED_CHAT_KIND, 1),
  interviews: fixtureUuid(SHARED_CHAT_KIND, 2),
} as const

interface SharedState {
  chat: ChatDto
  /** The question search and the default history use. */
  text: string
  detail: SharedChatDetailDto
}

const ago = (ms: number) => new Date(Date.now() - ms).toISOString()

function sharedChat(
  id: string,
  title: string,
  text: string,
  owner: UserRefDto,
  age: number,
): SharedState {
  const lastMessageAt = ago(age)
  const chat: ChatDto = {
    id,
    title,
    titleGenerated: true,
    folderId: null,
    isPinned: false,
    pinnedAt: null,
    isPrivate: false,
    agent: null,
    knowledgeScope: 'all',
    knowledgeBaseIds: [],
    currentModelKey: 'openai/gpt-4.1',
    lastMessageAt,
    messageCount: 2,
    matchedText: null,
    deletedAt: null,
    purgeAt: null,
    createdAt: lastMessageAt,
    updatedAt: lastMessageAt,
  }
  return {
    chat,
    text,
    detail: {
      id,
      title,
      agent: null,
      lastMessageAt,
      messageCount: 2,
      owner,
      sharedBy: owner,
      sharedAt: ago(age - HOUR_MS),
    },
  }
}

function seedShared(): SharedState[] {
  return [
    sharedChat(
      SHARED_CHAT_IDS.launch,
      'Launch plan for v2',
      'List the launch steps for the v2 release.',
      OMAR,
      3 * HOUR_MS,
    ),
    sharedChat(
      SHARED_CHAT_IDS.interviews,
      'Interview questions for support',
      'Five interview questions for a support role.',
      ANA,
      2 * DAY_MS,
    ),
  ]
}

let ordinal = 0
const nextShareId = () => fixtureUuid(SHARE_KIND, ++ordinal)

function share(subject: ChatShareTargetDto, createdAt: string): ChatShareDto {
  return {
    id: nextShareId(),
    subjectType: subject.subjectType,
    user: subject.subjectType === 'user' ? subject.user : null,
    team: subject.subjectType === 'team' ? subject.team : null,
    sharedBy: MAYA,
    createdAt,
  }
}

let shared = seedShared()
/** Shares of Maya's own chats, by chat id. */
let shares = new Map<string, ChatShareDto[]>()

/** Back to the seeded shares; `quarterlyChatId` starts shared with the Support team and Omar. */
export function resetChatSharesMock(quarterlyChatId: string): void {
  ordinal = 0
  shared = seedShared()
  const [support, , omar] = SHARE_TARGETS
  shares = new Map(
    support && omar
      ? [[quarterlyChatId, [share(support, ago(DAY_MS)), share(omar, ago(DAY_MS))]]]
      : [],
  )
}

/** A chat shared with Maya, for its messages and sources; owner routes never see it. */
export const findSharedChat = (chatId: string) => {
  const found = shared.find((state) => state.chat.id === chatId)
  return found && { chat: found.chat, text: found.text }
}

/** Distinct people a chat's shares reach (team members are counted as the team's size). */
function sharesOf(chatId: string, sharingEnabled: boolean): ChatSharesDto {
  const list = shares.get(chatId) ?? []
  return {
    shares: list,
    peopleWithAccess: list.reduce((sum, row) => sum + (row.team ? row.team.memberCount : 1), 0),
    sharingEnabled,
  }
}

const targetKey = (target: ChatShareTargetDto) =>
  target.subjectType === 'user' ? target.user.id : target.team.id

const chatNotFound = () => mockError(HTTP_NOT_FOUND, ERROR_CODES.CHAT_NOT_FOUND, 'Chat not found')
const sharingDisabled = () =>
  mockError(HTTP_FORBIDDEN, ERROR_CODES.CHAT_SHARING_DISABLED, 'Chat sharing is turned off')

const toRow = ({ detail }: SharedState): SharedChatDto => ({
  id: detail.id,
  title: detail.title,
  owner: detail.owner,
  lastMessageAt: detail.lastMessageAt,
  sharedAt: detail.sharedAt,
})

/**
 * Shared chats (C-11): the shares of Maya's own chats, the people and teams she can share with,
 * and the chats others shared with her. Scenarios: `sharing-disabled` answers as an organization
 * that turned chat sharing off; `no-shared-chats` leaves "Shared with me" empty.
 */
export function createChatShareHandlers(findOwn: (chatId: string) => ChatDto | undefined) {
  const ownChat = (chatId: unknown) => {
    const chat = typeof chatId === 'string' ? findOwn(chatId) : undefined
    return chat && !chat.deletedAt ? chat : null
  }
  const sharesPath = '/orgs/:orgId/chats/:chatId/shares'

  return [
    defineMockHandler({
      method: 'get',
      path: sharesPath,
      response: okResponse(chatSharesDtoSchema),
      scenarios: {
        default: ({ params }) => {
          const chat = ownChat(params.chatId)
          return chat ? mockOk(sharesOf(chat.id, true)) : chatNotFound()
        },
        'sharing-disabled': ({ params }) => {
          const chat = ownChat(params.chatId)
          return chat ? mockOk(sharesOf(chat.id, false)) : chatNotFound()
        },
      },
    }),
    defineMockHandler({
      method: 'post',
      path: sharesPath,
      response: okResponse(chatSharesDtoSchema),
      scenarios: {
        default: async ({ params, request }) => {
          const chat = ownChat(params.chatId)
          if (!chat) return chatNotFound()
          if (chat.isPrivate) {
            return mockError(
              HTTP_UNPROCESSABLE,
              ERROR_CODES.CHAT_PRIVATE_NOT_SHAREABLE,
              'Private chats are never shared',
            )
          }
          const { subjects } = createChatSharesInputSchema.parse(await request.json())
          const list = [...(shares.get(chat.id) ?? [])]
          const now = new Date().toISOString()
          for (const subject of subjects) {
            const id = subject.subjectType === 'user' ? subject.userId : subject.teamId
            const target = SHARE_TARGETS.find((candidate) => targetKey(candidate) === id)
            if (!target) {
              return mockError(
                HTTP_UNPROCESSABLE,
                ERROR_CODES.CHAT_SHARE_TARGET_NOT_FOUND,
                'Not in the organization',
              )
            }
            if (!list.some((row) => (row.user?.id ?? row.team?.id) === id)) {
              list.push(share(target, now))
            }
          }
          shares.set(chat.id, list)
          return mockOk(sharesOf(chat.id, true), { status: 201 })
        },
        'sharing-disabled': () => sharingDisabled(),
      },
    }),
    defineMockHandler({
      method: 'delete',
      path: `${sharesPath}/:shareId`,
      response: okResponse(z.null()),
      scenarios: {
        default: ({ params }) => {
          const chat = ownChat(params.chatId)
          if (!chat) return chatNotFound()
          const list = shares.get(chat.id) ?? []
          if (!list.some((row) => row.id === params.shareId)) {
            return mockError(HTTP_NOT_FOUND, ERROR_CODES.CHAT_SHARE_NOT_FOUND, 'Share not found')
          }
          shares.set(
            chat.id,
            list.filter((row) => row.id !== params.shareId),
          )
          return new Response(null, { status: 204 })
        },
      },
    }),
    defineMockHandler({
      method: 'get',
      path: '/orgs/:orgId/chat-share-targets',
      response: pageResponse(chatShareTargetDtoSchema),
      scenarios: {
        default: ({ request }) => {
          const q = new URL(request.url).searchParams.get('q')?.toLowerCase()
          const matches = (target: ChatShareTargetDto) =>
            !q ||
            (target.subjectType === 'user'
              ? `${target.user.name} ${target.user.email}`
              : target.team.name
            )
              .toLowerCase()
              .includes(q)
          return mockPage(SHARE_TARGETS.filter(matches), null)
        },
        'sharing-disabled': () => sharingDisabled(),
      },
    }),
    defineMockHandler({
      method: 'get',
      path: '/orgs/:orgId/shared-chats',
      response: pageResponse(sharedChatDtoSchema),
      scenarios: {
        default: () =>
          mockPage(
            shared
              .map(toRow)
              .toSorted((a, b) => (b.lastMessageAt ?? '').localeCompare(a.lastMessageAt ?? '')),
            null,
          ),
        'no-shared-chats': () => mockPage([], null),
        'sharing-disabled': () => mockPage([], null),
      },
    }),
    defineMockHandler({
      method: 'get',
      path: '/orgs/:orgId/shared-chats/:chatId',
      response: okResponse(sharedChatDetailDtoSchema),
      scenarios: {
        default: ({ params }) => {
          const found = shared.find((state) => state.chat.id === params.chatId)
          return found ? mockOk(found.detail) : chatNotFound()
        },
      },
    }),
  ]
}
