// SPDX-License-Identifier: AGPL-3.0-only
import { randomUUID } from 'node:crypto'

import { eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'

import { chatMessages, chats } from '@/database/tables/index.js'
import {
  CHAT_RESTORE_WINDOW_DAYS,
  chatDtoSchema,
  chatFeedbackDtoSchema,
  chatFolderDtoSchema,
  ERROR_CODES,
} from '@surefy/contracts'

import {
  as,
  createFolder,
  enableProxyModel,
  getChat,
  orgUrl,
  startChat,
  thread,
} from './chatsTestKit.js'
import { setupTwoOrgs } from '../../../../test/helpers/orgSetup.js'
import {
  expectData,
  expectError,
  expectNoContent,
  expectPage,
  request,
} from '../../../../test/helpers/request.js'

const DAY_MS = 86_400_000

describe('chat folders', () => {
  it('creates, lists with counts, renames, reorders and deletes folders of one person', async () => {
    const setup = await setupTwoOrgs()
    const url = (path = '') => orgUrl(setup, `/chat-folders${path}`)
    const support = await createFolder(setup, 'Support')
    const personal = await createFolder(setup, 'Personal')
    expect([support.sortOrder, personal.sortOrder]).toEqual([0, 1])

    // names are unique per person, ignoring case
    expectError(
      await request(setup.app, 'POST', url(), {
        headers: as(setup),
        payload: { name: 'support' },
      }),
      409,
      ERROR_CODES.CHAT_FOLDER_NAME_TAKEN,
    )
    // another person may use the same name
    expect((await createFolder(setup, 'Support', 'adam')).name).toBe('Support')

    const renamed = expectData(
      await request(setup.app, 'PATCH', url(`/${support.id}`), {
        headers: as(setup),
        payload: { name: 'Customers' },
      }),
      200,
      chatFolderDtoSchema,
    )
    expect(renamed.name).toBe('Customers')

    const reordered = expectPage(
      await request(setup.app, 'PUT', url('/order'), {
        headers: as(setup),
        payload: { folderIds: [personal.id, support.id] },
      }),
      chatFolderDtoSchema,
    )
    expect(reordered.data.map((folder) => folder.name)).toEqual(['Personal', 'Customers'])
    // every folder, once
    expectError(
      await request(setup.app, 'PUT', url('/order'), {
        headers: as(setup),
        payload: { folderIds: [personal.id] },
      }),
      400,
      ERROR_CODES.BAD_REQUEST,
    )

    expectNoContent(
      await request(setup.app, 'DELETE', url(`/${personal.id}`), { headers: as(setup) }),
    )
    expectError(
      await request(setup.app, 'DELETE', url(`/${personal.id}`), { headers: as(setup) }),
      404,
      ERROR_CODES.CHAT_FOLDER_NOT_FOUND,
    )
    // other people's folders are not found
    expectError(
      await request(setup.app, 'PATCH', url(`/${support.id}`), {
        headers: as(setup, 'adam'),
        payload: { name: 'Mine now' },
      }),
      404,
      ERROR_CODES.CHAT_FOLDER_NOT_FOUND,
    )
  })
})

describe('chats', () => {
  it('lists the person’s own chats, newest first, with folders, pins and search', async () => {
    const setup = await setupTwoOrgs()
    await enableProxyModel(setup)
    const folder = await createFolder(setup, 'Support')
    const refunds = await startChat(setup, 'How do refunds work for annual plans?', {
      newChat: { folderId: folder.id },
    })
    const onboarding = await startChat(setup, 'Write an onboarding checklist for engineers')
    await startChat(setup, 'Adam asks something else', {}, 'adam')
    const list = (query: Record<string, string> = {}, who: 'uma' | 'adam' = 'uma') =>
      request(setup.app, 'GET', orgUrl(setup, '/chats'), { headers: as(setup, who), query })

    const all = expectPage(await list(), chatDtoSchema).data
    expect(all.map((chat) => chat.id)).toEqual([onboarding, refunds]) // newest message first
    expect(all.every((chat) => chat.messageCount === 2 && chat.title !== '')).toBe(true)
    expect(expectPage(await list({}, 'adam'), chatDtoSchema).data).toHaveLength(1)

    expect(
      expectPage(await list({ folderId: folder.id }), chatDtoSchema).data.map((chat) => chat.id),
    ).toEqual([refunds])
    expect(
      expectPage(await list({ folderId: 'none' }), chatDtoSchema).data.map((chat) => chat.id),
    ).toEqual([onboarding])

    // pinned chats
    const pinned = expectData(
      await request(setup.app, 'PATCH', orgUrl(setup, `/chats/${refunds}`), {
        headers: as(setup),
        payload: { isPinned: true },
      }),
      200,
      chatDtoSchema,
    )
    expect(pinned.isPinned).toBe(true)
    expect(pinned.pinnedAt).not.toBeNull()
    expect(
      expectPage(await list({ isPinned: 'true' }), chatDtoSchema).data.map((chat) => chat.id),
    ).toEqual([refunds])

    // search: a title match, and a match in a message text with the matched text shown
    const byMessage = expectPage(await list({ q: 'checklist' }), chatDtoSchema).data
    expect(byMessage.map((chat) => chat.id)).toEqual([onboarding])
    expect(byMessage[0]?.matchedText).toContain('checklist')
    expect(expectPage(await list({ q: 'zebra' }), chatDtoSchema).data).toEqual([])
  })

  it('pages the list with a cursor', async () => {
    const setup = await setupTwoOrgs()
    await enableProxyModel(setup)
    const ids = [
      await startChat(setup, 'one'),
      await startChat(setup, 'two'),
      await startChat(setup, 'three'),
    ]
    const first = expectPage(
      await request(setup.app, 'GET', orgUrl(setup, '/chats'), {
        headers: as(setup),
        query: { limit: '2' },
      }),
      chatDtoSchema,
    )
    expect(first.data).toHaveLength(2)
    expect(first.nextCursor).not.toBeNull()
    const second = expectPage(
      await request(setup.app, 'GET', orgUrl(setup, '/chats'), {
        headers: as(setup),
        query: { limit: '2', cursor: first.nextCursor ?? '' },
      }),
      chatDtoSchema,
    )
    expect([...first.data, ...second.data].map((chat) => chat.id)).toEqual([...ids].reverse())
    expect(second.nextCursor).toBeNull()
  })

  it('renames (stopping title regeneration), moves, and refuses other people’s chats', async () => {
    const setup = await setupTwoOrgs()
    await enableProxyModel(setup)
    const chatId = await startChat(setup)
    const folder = await createFolder(setup, 'Work')
    expect((await getChat(setup, chatId)).titleGenerated).toBe(true)
    const patched = expectData(
      await request(setup.app, 'PATCH', orgUrl(setup, `/chats/${chatId}`), {
        headers: as(setup),
        payload: { title: 'Refund rules', folderId: folder.id },
      }),
      200,
      chatDtoSchema,
    )
    expect(patched).toMatchObject({
      title: 'Refund rules',
      titleGenerated: false,
      folderId: folder.id,
    })
    expectError(
      await request(setup.app, 'PATCH', orgUrl(setup, `/chats/${chatId}`), {
        headers: as(setup),
        payload: { folderId: randomUUID() },
      }),
      404,
      ERROR_CODES.CHAT_FOLDER_NOT_FOUND,
    )
    // Adam is in the same organization and still cannot see Uma's chat
    expectError(
      await request(setup.app, 'GET', orgUrl(setup, `/chats/${chatId}`), {
        headers: as(setup, 'adam'),
      }),
      404,
      ERROR_CODES.CHAT_NOT_FOUND,
    )
    expectError(
      await request(setup.app, 'GET', orgUrl(setup, `/chats/${chatId}/messages`), {
        headers: as(setup, 'olivia'),
      }),
      404,
      ERROR_CODES.CHAT_NOT_FOUND,
    )
    // a folder delete returns its chats to the list
    expectNoContent(
      await request(setup.app, 'DELETE', orgUrl(setup, `/chat-folders/${folder.id}`), {
        headers: as(setup),
      }),
    )
    expect((await getChat(setup, chatId)).folderId).toBeNull()
  })

  it('deletes into Recently deleted and restores within 30 days', async () => {
    const setup = await setupTwoOrgs()
    await enableProxyModel(setup)
    const chatId = await startChat(setup)
    const url = orgUrl(setup, `/chats/${chatId}`)
    const deleted = (query: Record<string, string> = { state: 'deleted' }) =>
      request(setup.app, 'GET', orgUrl(setup, '/chats'), { headers: as(setup), query })

    expectNoContent(await request(setup.app, 'DELETE', url, { headers: as(setup) }))
    expectError(
      await request(setup.app, 'GET', url, { headers: as(setup) }),
      404,
      ERROR_CODES.CHAT_NOT_FOUND,
    )
    expect(expectPage(await deleted({}), chatDtoSchema).data).toEqual([])
    const [gone] = expectPage(await deleted(), chatDtoSchema).data
    expect(gone?.id).toBe(chatId)
    expect(gone?.deletedAt).not.toBeNull()
    const purgeAt =
      new Date(gone?.purgeAt ?? 0).getTime() - new Date(gone?.deletedAt ?? 0).getTime()
    expect(purgeAt).toBe(CHAT_RESTORE_WINDOW_DAYS * DAY_MS)
    // nothing else changed: the messages are still there
    expect(
      await setup.db.tenant(setup.a.id, (tx) =>
        tx.select().from(chatMessages).where(eq(chatMessages.chatId, chatId)),
      ),
    ).toHaveLength(2)

    const restored = expectData(
      await request(setup.app, 'POST', `${url}/restore`, { headers: as(setup) }),
      200,
      chatDtoSchema,
    )
    expect(restored.deletedAt).toBeNull()
    expect(await thread(setup, chatId)).toHaveLength(2)

    // past the window the chat cannot come back
    await request(setup.app, 'DELETE', url, { headers: as(setup) })
    await setup.db.system('test', (tx) =>
      tx
        .update(chats)
        .set({ deletedAt: new Date(Date.now() - (CHAT_RESTORE_WINDOW_DAYS + 1) * DAY_MS) })
        .where(eq(chats.id, chatId)),
    )
    expectError(
      await request(setup.app, 'POST', `${url}/restore`, { headers: as(setup) }),
      404,
      ERROR_CODES.CHAT_NOT_FOUND,
    )
  })

  it('private chats need an enabled local model', async () => {
    const setup = await setupTwoOrgs()
    await enableProxyModel(setup) // a provider model, not a local one
    const chatId = await startChat(setup)
    expectError(
      await request(setup.app, 'PATCH', orgUrl(setup, `/chats/${chatId}`), {
        headers: as(setup),
        payload: { isPrivate: true },
      }),
      422,
      ERROR_CODES.CHAT_PRIVATE_REQUIRES_LOCAL_MODEL,
    )
  })

  it('sets the knowledge scope and its selection', async () => {
    const setup = await setupTwoOrgs()
    await enableProxyModel(setup)
    const chatId = await startChat(setup)
    const bases = [randomUUID(), randomUUID()]
    const selected = expectData(
      await request(setup.app, 'PATCH', orgUrl(setup, `/chats/${chatId}`), {
        headers: as(setup),
        payload: { knowledgeScope: 'selected', knowledgeBaseIds: bases },
      }),
      200,
      chatDtoSchema,
    )
    expect(selected.knowledgeScope).toBe('selected')
    expect([...selected.knowledgeBaseIds].sort((a, b) => a.localeCompare(b))).toEqual(
      [...bases].sort((a, b) => a.localeCompare(b)),
    )
    const none = expectData(
      await request(setup.app, 'PATCH', orgUrl(setup, `/chats/${chatId}`), {
        headers: as(setup),
        payload: { knowledgeScope: 'none' },
      }),
      200,
      chatDtoSchema,
    )
    expect(none.knowledgeBaseIds).toEqual([])
  })
})

describe('answer feedback', () => {
  it('rates, replaces and clears a rating; only finished answers can be rated', async () => {
    const setup = await setupTwoOrgs()
    await enableProxyModel(setup)
    const chatId = await startChat(setup)
    const [question, answer] = await thread(setup, chatId)
    if (question === undefined || answer === undefined) throw new Error('a thread of two')
    const url = (messageId: string) =>
      orgUrl(setup, `/chats/${chatId}/messages/${messageId}/feedback`)

    const rated = expectData(
      await request(setup.app, 'PUT', url(answer.id), {
        headers: as(setup),
        payload: { rating: 'not_helpful', correctionText: 'Mention the 14 days' },
      }),
      200,
      chatFeedbackDtoSchema,
    )
    expect(rated).toMatchObject({ rating: 'not_helpful', correctionText: 'Mention the 14 days' })
    expect((await thread(setup, chatId))[1]?.feedback?.rating).toBe('not_helpful')

    const replaced = expectData(
      await request(setup.app, 'PUT', url(answer.id), {
        headers: as(setup),
        payload: { rating: 'helpful' },
      }),
      200,
      chatFeedbackDtoSchema,
    )
    expect(replaced).toMatchObject({ rating: 'helpful', correctionText: null })
    // a person's rating is theirs: Adam sees none on a thread he cannot open
    expectError(
      await request(setup.app, 'PUT', url(answer.id), {
        headers: as(setup, 'adam'),
        payload: { rating: 'helpful' },
      }),
      404,
      ERROR_CODES.CHAT_NOT_FOUND,
    )

    expectError(
      await request(setup.app, 'PUT', url(question.id), {
        headers: as(setup),
        payload: { rating: 'helpful' },
      }),
      409,
      ERROR_CODES.CHAT_FEEDBACK_NOT_ALLOWED,
    )
    expectNoContent(await request(setup.app, 'DELETE', url(answer.id), { headers: as(setup) }))
    expect((await thread(setup, chatId))[1]?.feedback).toBeNull()
    expectError(
      await request(setup.app, 'PUT', url(randomUUID()), {
        headers: as(setup),
        payload: { rating: 'helpful' },
      }),
      404,
      ERROR_CODES.CHAT_MESSAGE_NOT_FOUND,
    )
  })
})

describe('source preview', () => {
  it('previews a web source and answers 404 for a missing one', async () => {
    const setup = await setupTwoOrgs()
    await enableProxyModel(setup)
    const chatId = await startChat(setup)
    const [, answer] = await thread(setup, chatId)
    if (answer === undefined) throw new Error('an answer')
    // a web source is part of the answer's parts
    await setup.db.tenant(setup.a.id, (tx) =>
      tx
        .update(chatMessages)
        .set({
          parts: {
            version: 1,
            parts: [
              { type: 'text', text: 'See [1]' },
              {
                type: 'source',
                index: 1,
                kind: 'web',
                url: 'https://example.test/policy',
                title: 'Policy',
                snippet: 'Refunds within 14 days',
              },
              {
                type: 'source',
                index: 2,
                kind: 'knowledge',
                knowledgeBaseId: randomUUID(),
                documentId: randomUUID(),
                title: 'Handbook',
                snippet: 'x',
              },
            ],
          },
        })
        .where(eq(chatMessages.id, answer.id)),
    )
    const url = (index: number) =>
      orgUrl(setup, `/chats/${chatId}/messages/${answer.id}/sources/${String(index)}`)
    const web = (await request(setup.app, 'GET', url(1), { headers: as(setup) })).json<{
      data: Record<string, unknown>
    }>().data
    expect(web).toMatchObject({
      index: 1,
      kind: 'web',
      status: 'available',
      passage: 'Refunds within 14 days',
      url: 'https://example.test/policy',
    })
    // knowledge is checked again by the knowledge module; until it exists the source is "removed"
    const knowledge = (await request(setup.app, 'GET', url(2), { headers: as(setup) })).json<{
      data: Record<string, unknown>
    }>().data
    expect(knowledge).toMatchObject({ status: 'removed', passage: null, title: 'Handbook' })
    expectError(
      await request(setup.app, 'GET', url(9), { headers: as(setup) }),
      404,
      ERROR_CODES.CHAT_MESSAGE_NOT_FOUND,
    )
  })
})
