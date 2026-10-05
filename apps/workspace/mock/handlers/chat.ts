// SPDX-License-Identifier: AGPL-3.0-only
import { z } from 'zod'

import {
  CHAT_RESTORE_WINDOW_DAYS,
  chatDtoSchema,
  chatFolderDtoSchema,
  createChatFolderInputSchema,
  ERROR_CODES,
  okResponse,
  pageResponse,
  PAGE_SIZE,
  updateChatFolderInputSchema,
  updateChatInputSchema,
} from '@surefy/contracts'
import type { ChatDto, ChatFolderDto } from '@surefy/contracts'
import { defineFactory, fixtureUuid } from '@surefy/web-core/testing'
import {
  defineMockDomain,
  defineMockHandler,
  mockError,
  mockOk,
  mockPage,
} from '@surefy/web-core/testing/mock'

import { createChatMessageHandlers, resetChatMessagesMock } from './chat.messages'

const CHAT_KIND = 70
const FOLDER_KIND = 71
const HTTP_CONFLICT = 409
const HTTP_NOT_FOUND = 404
const HOUR_MS = 3_600_000
const DAY_MS = 24 * HOUR_MS
const MATCH_CONTEXT_CHARS = 60

export const SUPPORT_FOLDER_ID = fixtureUuid(FOLDER_KIND, 1)
export const PERSONAL_FOLDER_ID = fixtureUuid(FOLDER_KIND, 2)

/** A chat with no messages, outside every folder, unless overridden. */
export const chatFactory = defineFactory(chatDtoSchema, (sequence): ChatDto => ({
  id: fixtureUuid(CHAT_KIND, sequence),
  title: `Chat ${sequence}`,
  titleGenerated: true,
  folderId: null,
  isPinned: false,
  pinnedAt: null,
  isPrivate: false,
  agentId: null,
  knowledgeScope: 'all',
  knowledgeBaseIds: [],
  currentModelKey: null,
  lastMessageAt: null,
  messageCount: 0,
  matchedText: null,
  deletedAt: null,
  purgeAt: null,
  createdAt: '2026-01-02T09:00:00.000Z',
  updatedAt: '2026-01-02T09:00:00.000Z',
}))

export const folderFactory = defineFactory(chatFolderDtoSchema, (sequence): ChatFolderDto => ({
  id: fixtureUuid(FOLDER_KIND, sequence),
  name: `Folder ${sequence}`,
  sortOrder: sequence - 1,
  chatCount: 0,
  createdAt: '2026-01-02T09:00:00.000Z',
  updatedAt: '2026-01-02T09:00:00.000Z',
}))

interface ChatState {
  chat: ChatDto
  /** The message text search looks in besides the title. */
  text: string
}

const ago = (ms: number) => new Date(Date.now() - ms).toISOString()

/** Seeded relative to now, so the date groups ("Today", "Previous 7 days"…) hold in any run. */
function seedChats(): ChatState[] {
  chatFactory.reset()
  const live = (
    title: string,
    age: number,
    text: string,
    overrides: Partial<ChatDto> = {},
  ): ChatState => ({
    chat: chatFactory({
      title,
      lastMessageAt: ago(age),
      messageCount: 4,
      createdAt: ago(age),
      updatedAt: ago(age),
      ...overrides,
    }),
    text,
  })
  return [
    live('Quarterly report summary', 2 * HOUR_MS, 'Summarize the revenue lines by region.', {
      isPinned: true,
      pinnedAt: ago(DAY_MS),
    }),
    live('Refund policy for annual plans', 3 * HOUR_MS, 'Customers may cancel within 14 days.', {
      folderId: SUPPORT_FOLDER_ID,
    }),
    live('Onboarding checklist', 4 * HOUR_MS, 'A first-week checklist for new engineers.'),
    live('Reply to the Acme escalation', 3 * DAY_MS, 'Draft a calm reply about the outage.', {
      folderId: SUPPORT_FOLDER_ID,
    }),
    live('SQL window functions', 12 * DAY_MS, 'Explain row_number and rank with an example.'),
    live('Trip ideas for March', 40 * DAY_MS, 'Three weekends away within a train ride.', {
      folderId: PERSONAL_FOLDER_ID,
    }),
    {
      chat: chatFactory({
        title: 'Old brainstorm',
        lastMessageAt: ago(5 * DAY_MS),
        messageCount: 2,
        deletedAt: ago(3 * DAY_MS),
        purgeAt: ago(3 * DAY_MS - CHAT_RESTORE_WINDOW_DAYS * DAY_MS),
      }),
      text: 'Names for the internal tool.',
    },
    live('Weekly sync notes', DAY_MS + 2 * HOUR_MS, 'Action items from Monday.'),
    live('Pricing page copy', 4 * DAY_MS, 'Shorter headlines for the pricing page.'),
  ]
}

function seedFolders(): ChatFolderDto[] {
  folderFactory.reset()
  return [folderFactory({ name: 'Support' }), folderFactory({ name: 'Personal' })]
}

let chats = seedChats()
let folders = seedFolders()

/** Back to the seeded chats and folders; tests call it between cases. */
export function resetChatMock(): void {
  chats = seedChats()
  folders = seedFolders()
  resetChatMessagesMock()
}

/** Chat ids of the seed, in the order they were created. */
export const SEEDED_CHAT_IDS = {
  quarterly: fixtureUuid(CHAT_KIND, 1),
  refunds: fixtureUuid(CHAT_KIND, 2),
  onboarding: fixtureUuid(CHAT_KIND, 3),
  acme: fixtureUuid(CHAT_KIND, 4),
  sql: fixtureUuid(CHAT_KIND, 5),
  trip: fixtureUuid(CHAT_KIND, 6),
  brainstorm: fixtureUuid(CHAT_KIND, 7),
  sync: fixtureUuid(CHAT_KIND, 8),
  pricing: fixtureUuid(CHAT_KIND, 9),
} as const

const folderCount = (folderId: string) =>
  chats.filter(({ chat }) => chat.folderId === folderId && !chat.deletedAt).length
const withCount = (folder: ChatFolderDto): ChatFolderDto => ({
  ...folder,
  chatCount: folderCount(folder.id),
})

const findChat = (id: unknown) => chats.find(({ chat }) => chat.id === id)
const setChat = (next: ChatDto) => {
  chats = chats.map((state) => (state.chat.id === next.id ? { ...state, chat: next } : state))
}
const findFolder = (id: unknown) => folders.find((folder) => folder.id === id)
const nameTaken = (name: string, exceptId?: string) =>
  folders.some(
    (folder) => folder.id !== exceptId && folder.name.toLowerCase() === name.toLowerCase(),
  )

function page(items: readonly object[], url: URL) {
  const limit = Number(url.searchParams.get('limit') ?? PAGE_SIZE.default)
  const start = Number(url.searchParams.get('cursor') ?? 0)
  const next = start + limit < items.length ? String(start + limit) : null
  return mockPage(items.slice(start, start + limit) as never[], next)
}

/** The message text around the match, as the list shows it under a title that did not match. */
function excerpt(text: string, query: string): string {
  const at = text.toLowerCase().indexOf(query)
  const start = Math.max(0, at - MATCH_CONTEXT_CHARS / 2)
  return text.slice(start, start + MATCH_CONTEXT_CHARS)
}

function matches({ chat, text }: ChatState, query: string | undefined): ChatDto | null {
  if (!query) return chat
  if (chat.title.toLowerCase().includes(query)) return chat
  return text.toLowerCase().includes(query) ? { ...chat, matchedText: excerpt(text, query) } : null
}

function inFolder(chat: ChatDto, folderId: string | null): boolean {
  if (folderId === null) return true
  return folderId === 'none' ? chat.folderId === null : chat.folderId === folderId
}

function compare(sort: string) {
  const field = sort.replace('-', '') as 'lastMessageAt' | 'pinnedAt' | 'deletedAt'
  const direction = sort.startsWith('-') ? -1 : 1
  return (a: ChatDto, b: ChatDto) => (a[field] ?? '').localeCompare(b[field] ?? '') * direction
}

const path = '/orgs/:orgId/chats'
const foldersPath = '/orgs/:orgId/chat-folders'
const noContent = () => new Response(null, { status: 204 })
const chatNotFound = () => mockError(HTTP_NOT_FOUND, ERROR_CODES.CHAT_NOT_FOUND, 'Chat not found')
const folderNotFound = () =>
  mockError(HTTP_NOT_FOUND, ERROR_CODES.CHAT_FOLDER_NOT_FOUND, 'Folder not found')
const folderNameTaken = () =>
  mockError(HTTP_CONFLICT, ERROR_CODES.CHAT_FOLDER_NAME_TAKEN, 'Name taken')

/**
 * Chats and folders (C-03's routes) until the integration task (I4-02) switches to the real API;
 * messages, streaming, feedback, sources and attachments are in `chat.messages.ts` (S3-07). Scenarios: `folder-name-taken` fails a
 * folder create or rename with `CHAT_FOLDER_NAME_TAKEN`; `restore-gone` makes a restore answer
 * `CHAT_NOT_FOUND` (past the 30 days); `delete-fails` fails a chat delete.
 */
const chatMessageHandlers = createChatMessageHandlers({
  find: (chatId) => findChat(chatId),
  create: (chat) => {
    chats = [{ chat, text: '' }, ...chats]
  },
  update: (chat) => {
    setChat(chat)
  },
})

export const chatDomain = defineMockDomain('chat', [
  ...chatMessageHandlers,
  defineMockHandler({
    method: 'get',
    path,
    response: pageResponse(chatDtoSchema),
    scenarios: {
      default: ({ request }) => {
        const url = new URL(request.url)
        const query = url.searchParams.get('q')?.toLowerCase()
        const folderId = url.searchParams.get('folderId')
        const isPinned = url.searchParams.get('isPinned')
        const isDeleted = url.searchParams.get('state') === 'deleted'
        const sort = url.searchParams.get('sort') ?? (isDeleted ? '-deletedAt' : '-lastMessageAt')
        const items = chats
          .filter(({ chat }) => Boolean(chat.deletedAt) === isDeleted)
          .filter(({ chat }) => inFolder(chat, folderId))
          .filter(({ chat }) => isPinned === null || chat.isPinned === (isPinned === 'true'))
          .flatMap((state) => matches(state, query) ?? [])
          .sort(compare(sort))
        return page(items, url)
      },
    },
  }),
  defineMockHandler({
    method: 'get',
    path: `${path}/:chatId`,
    response: okResponse(chatDtoSchema),
    scenarios: {
      default: ({ params }) => {
        const found = findChat(params.chatId)
        return found && !found.chat.deletedAt ? mockOk(found.chat) : chatNotFound()
      },
    },
  }),
  defineMockHandler({
    method: 'patch',
    path: `${path}/:chatId`,
    response: okResponse(chatDtoSchema),
    scenarios: {
      default: async ({ params, request }) => {
        const found = findChat(params.chatId)
        if (!found || found.chat.deletedAt) return chatNotFound()
        const {
          title,
          isPinned,
          folderId,
          isPrivate,
          knowledgeScope,
          knowledgeBaseIds,
          currentModelKey,
        } = updateChatInputSchema.parse(await request.json())
        if (folderId && !findFolder(folderId)) return folderNotFound()
        const now = new Date().toISOString()
        const next: ChatDto = {
          ...found.chat,
          ...(title === undefined ? {} : { title, titleGenerated: false }),
          ...(folderId === undefined ? {} : { folderId }),
          ...(isPinned === undefined ? {} : { isPinned, pinnedAt: isPinned ? now : null }),
          ...(isPrivate === undefined ? {} : { isPrivate }),
          ...(knowledgeScope === undefined
            ? {}
            : {
                knowledgeScope,
                knowledgeBaseIds: knowledgeScope === 'selected' ? (knowledgeBaseIds ?? []) : [],
              }),
          ...(currentModelKey === undefined ? {} : { currentModelKey }),
          updatedAt: now,
        }
        setChat(next)
        return mockOk(next)
      },
    },
  }),
  defineMockHandler({
    method: 'delete',
    path: `${path}/:chatId`,
    response: okResponse(z.null()),
    scenarios: {
      default: ({ params }) => {
        const found = findChat(params.chatId)
        if (!found || found.chat.deletedAt) return chatNotFound()
        const deletedAt = new Date()
        setChat({
          ...found.chat,
          deletedAt: deletedAt.toISOString(),
          purgeAt: new Date(deletedAt.getTime() + CHAT_RESTORE_WINDOW_DAYS * DAY_MS).toISOString(),
        })
        return noContent()
      },
      'delete-fails': () => mockError(500, ERROR_CODES.INTERNAL_ERROR, 'Something went wrong'),
    },
  }),
  defineMockHandler({
    method: 'post',
    path: `${path}/:chatId/restore`,
    response: okResponse(chatDtoSchema),
    scenarios: {
      default: ({ params }) => {
        const found = findChat(params.chatId)
        if (!found?.chat.deletedAt) return chatNotFound()
        // The folder may have been deleted meanwhile: the chat returns to the list
        const next: ChatDto = {
          ...found.chat,
          deletedAt: null,
          purgeAt: null,
          folderId: findFolder(found.chat.folderId) ? found.chat.folderId : null,
        }
        setChat(next)
        return mockOk(next)
      },
      'restore-gone': () => chatNotFound(),
    },
  }),
  defineMockHandler({
    method: 'get',
    path: foldersPath,
    response: pageResponse(chatFolderDtoSchema),
    scenarios: {
      default: ({ request }) =>
        page(
          [...folders].sort((a, b) => a.sortOrder - b.sortOrder).map(withCount),
          new URL(request.url),
        ),
    },
  }),
  defineMockHandler({
    method: 'post',
    path: foldersPath,
    response: okResponse(chatFolderDtoSchema),
    scenarios: {
      default: async ({ request }) => {
        const { name } = createChatFolderInputSchema.parse(await request.json())
        if (nameTaken(name)) return folderNameTaken()
        const folder = folderFactory({ name, sortOrder: folders.length })
        folders = [...folders, folder]
        return mockOk(withCount(folder), { status: 201 })
      },
      'folder-name-taken': () => folderNameTaken(),
    },
  }),
  defineMockHandler({
    method: 'patch',
    path: `${foldersPath}/:folderId`,
    response: okResponse(chatFolderDtoSchema),
    scenarios: {
      default: async ({ params, request }) => {
        const found = findFolder(params.folderId)
        if (!found) return folderNotFound()
        const { name } = updateChatFolderInputSchema.parse(await request.json())
        if (nameTaken(name, found.id)) return folderNameTaken()
        const next = { ...found, name, updatedAt: new Date().toISOString() }
        folders = folders.map((folder) => (folder.id === next.id ? next : folder))
        return mockOk(withCount(next))
      },
      'folder-name-taken': () => folderNameTaken(),
    },
  }),
  defineMockHandler({
    method: 'delete',
    path: `${foldersPath}/:folderId`,
    response: okResponse(z.null()),
    scenarios: {
      default: ({ params }) => {
        const folderId = String(params.folderId)
        if (!findFolder(folderId)) return folderNotFound()
        folders = folders.filter((folder) => folder.id !== folderId)
        // Its chats move back to the list
        chats = chats.map((state) =>
          state.chat.folderId === folderId
            ? { ...state, chat: { ...state.chat, folderId: null } }
            : state,
        )
        return noContent()
      },
    },
  }),
])
