// SPDX-License-Identifier: AGPL-3.0-only
import { and, eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'

import { chats, notifications } from '@/database/tables/index.js'
import { auditLogs } from '@/database/tables/partitioned/audit.tables.js'
import {
  chatMessageDtoSchema,
  chatSharesDtoSchema,
  chatShareTargetDtoSchema,
  ERROR_CODES,
  sharedChatDetailDtoSchema,
  sharedChatDtoSchema,
  teamDtoSchema,
} from '@surefy/contracts'

import { as, enableProxyModel, orgUrl, startChat } from './chatsTestKit.js'
import { setupTwoOrgs, type TwoOrgSetup } from '../../../../test/helpers/orgSetup.js'
import {
  expectData,
  expectError,
  expectNoContent,
  expectPage,
  request,
} from '../../../../test/helpers/request.js'

import type { Who } from './chatsTestKit.js'

async function createTeam(setup: TwoOrgSetup, name: string, members: Who[]) {
  return expectData(
    await request(setup.app, 'POST', orgUrl(setup, '/teams'), {
      headers: as(setup, 'adam'),
      payload: { name, memberUserIds: members.map((who) => setup.a.members[who].id) },
    }),
    201,
    teamDtoSchema,
  )
}

const share = (setup: TwoOrgSetup, chatId: string, subjects: unknown[], who: Who = 'uma') =>
  request(setup.app, 'POST', orgUrl(setup, `/chats/${chatId}/shares`), {
    headers: as(setup, who),
    payload: { subjects },
  })

const readThread = (setup: TwoOrgSetup, chatId: string, who: Who) =>
  request(setup.app, 'GET', orgUrl(setup, `/chats/${chatId}/messages`), {
    headers: as(setup, who),
  })

const setSharing = async (setup: TwoOrgSetup, enabled: boolean) => {
  const response = await request(setup.app, 'PATCH', orgUrl(setup, ''), {
    headers: as(setup, 'olivia'),
    payload: { settings: { privacy: { chatSharingEnabled: enabled } } },
  })
  expect(response.statusCode).toBe(200)
}

async function sharedChat(): Promise<{ setup: TwoOrgSetup; chatId: string }> {
  const setup = await setupTwoOrgs()
  await enableProxyModel(setup)
  return { setup, chatId: await startChat(setup) }
}

describe('chat shares', () => {
  it('shares a chat view only with people and teams, and tells each of them once', async () => {
    const { setup, chatId } = await sharedChat()
    const { adam, olivia, uma } = setup.a.members
    const team = await createTeam(setup, 'Support', ['olivia', 'adam'])

    const subjects = [
      { subjectType: 'user', userId: adam.id },
      { subjectType: 'team', teamId: team.id },
      // the owner reads the chat anyway: no share with her
      { subjectType: 'user', userId: uma.id },
    ]
    const shared = expectData(await share(setup, chatId, subjects), 200, chatSharesDtoSchema)
    expect(shared.shares.map((row) => row.subjectType)).toEqual(['user', 'team'])
    expect(shared.shares[0]?.user?.id).toBe(adam.id)
    expect(shared.shares[1]?.team).toEqual({ id: team.id, name: 'Support', memberCount: 2 })
    expect(shared.shares[0]?.sharedBy?.id).toBe(uma.id)
    expect(shared.peopleWithAccess).toBe(2)
    expect(shared.sharingEnabled).toBe(true)

    // sharing again leaves the shares as they are
    const again = expectData(await share(setup, chatId, subjects), 200, chatSharesDtoSchema)
    expect(again.shares.map((row) => row.id)).toEqual(shared.shares.map((row) => row.id))

    const told = await setup.db.tenant(setup.a.id, (tx) =>
      tx
        .select({ userId: notifications.userId, params: notifications.params })
        .from(notifications)
        .where(and(eq(notifications.type, 'chat.shared'), eq(notifications.targetId, chatId))),
    )
    const byId = (a: string, b: string) => a.localeCompare(b)
    expect(told.map((row) => row.userId).sort(byId)).toEqual([adam.id, olivia.id].sort(byId))
    expect(told.find((row) => row.userId === olivia.id)?.params).toMatchObject({
      teamName: 'Support',
    })
    const audited = await setup.db.tenant(setup.a.id, (tx) =>
      tx
        .select({ action: auditLogs.action, metadata: auditLogs.metadata })
        .from(auditLogs)
        .where(eq(auditLogs.targetId, chatId)),
    )
    expect(audited.map((row) => row.action)).toEqual(['chat.shared'])
    expect(audited[0]?.metadata).toMatchObject({ counts: { people: 1, teams: 1 } })

    // the people it reaches find it under Shared with me and read the thread
    const list = expectPage(
      await request(setup.app, 'GET', orgUrl(setup, '/shared-chats'), {
        headers: as(setup, 'adam'),
      }),
      sharedChatDtoSchema,
    ).data
    expect(list.map((row) => [row.id, row.owner?.id])).toEqual([[chatId, uma.id]])
    const header = expectData(
      await request(setup.app, 'GET', orgUrl(setup, `/shared-chats/${chatId}`), {
        headers: as(setup, 'olivia'),
      }),
      200,
      sharedChatDetailDtoSchema,
    )
    expect(header).toMatchObject({ id: chatId, messageCount: 2, sharedBy: { id: uma.id } })
    expect(
      expectPage(await readThread(setup, chatId, 'olivia'), chatMessageDtoSchema).data,
    ).toHaveLength(2)
    // the owner's list stays her own
    expect(
      expectPage(
        await request(setup.app, 'GET', orgUrl(setup, '/shared-chats'), { headers: as(setup) }),
        sharedChatDtoSchema,
      ).data,
    ).toEqual([])

    // view only: every other chat route stays the owner's
    for (const [method, path, payload] of [
      ['PATCH', `/chats/${chatId}`, { title: 'Mine now' }],
      ['GET', `/chats/${chatId}`, undefined],
      ['GET', `/chats/${chatId}/shares`, undefined],
      ['DELETE', `/chats/${chatId}`, undefined],
      ['POST', `/chats/${chatId}/messages`, { trigger: 'submit', text: 'Hi', attachmentIds: [] }],
    ] as const) {
      expectError(
        await request(setup.app, method, orgUrl(setup, path), {
          headers: as(setup, 'adam'),
          ...(payload === undefined ? {} : { payload }),
        }),
        404,
        ERROR_CODES.CHAT_NOT_FOUND,
      )
    }
    // another organization never reads it
    expectError(
      await request(setup.app, 'GET', orgUrl(setup, `/chats/${chatId}/messages`, setup.b.id), {
        headers: setup.sessionOf(setup.b.members.bea),
      }),
      404,
      ERROR_CODES.CHAT_NOT_FOUND,
    )

    // unsharing a person: the team still reaches Olivia, not Adam (who is in it too)
    const personal = shared.shares[0]
    if (personal === undefined) throw new Error('a personal share')
    expectNoContent(
      await request(setup.app, 'DELETE', orgUrl(setup, `/chats/${chatId}/shares/${personal.id}`), {
        headers: as(setup),
      }),
    )
    expect((await readThread(setup, chatId, 'adam')).statusCode).toBe(200)
    const teamShare = shared.shares[1]
    if (teamShare === undefined) throw new Error('a team share')
    expectNoContent(
      await request(setup.app, 'DELETE', orgUrl(setup, `/chats/${chatId}/shares/${teamShare.id}`), {
        headers: as(setup),
      }),
    )
    expectError(await readThread(setup, chatId, 'olivia'), 404, ERROR_CODES.CHAT_NOT_FOUND)
    expectError(
      await request(setup.app, 'DELETE', orgUrl(setup, `/chats/${chatId}/shares/${teamShare.id}`), {
        headers: as(setup),
      }),
      404,
      ERROR_CODES.CHAT_SHARE_NOT_FOUND,
    )
  })

  it('honors no share while sharing is off, or the chat is deleted or private', async () => {
    const { setup, chatId } = await sharedChat()
    const adam = setup.a.members.adam
    expectData(
      await share(setup, chatId, [{ subjectType: 'user', userId: adam.id }]),
      200,
      chatSharesDtoSchema,
    )

    await setSharing(setup, false)
    expectError(
      await share(setup, chatId, [{ subjectType: 'user', userId: setup.a.members.olivia.id }]),
      403,
      ERROR_CODES.CHAT_SHARING_DISABLED,
    )
    expectError(await readThread(setup, chatId, 'adam'), 404, ERROR_CODES.CHAT_NOT_FOUND)
    expect(
      expectPage(
        await request(setup.app, 'GET', orgUrl(setup, '/shared-chats'), {
          headers: as(setup, 'adam'),
        }),
        sharedChatDtoSchema,
      ).data,
    ).toEqual([])
    // the rows are kept: the owner still sees them, with the reason
    const kept = expectData(
      await request(setup.app, 'GET', orgUrl(setup, `/chats/${chatId}/shares`), {
        headers: as(setup),
      }),
      200,
      chatSharesDtoSchema,
    )
    expect([kept.shares.length, kept.sharingEnabled]).toEqual([1, false])
    await setSharing(setup, true)
    expect((await readThread(setup, chatId, 'adam')).statusCode).toBe(200)

    // a deleted chat is hidden from the people it was shared with until it is restored
    expectNoContent(
      await request(setup.app, 'DELETE', orgUrl(setup, `/chats/${chatId}`), { headers: as(setup) }),
    )
    expectError(await readThread(setup, chatId, 'adam'), 404, ERROR_CODES.CHAT_NOT_FOUND)
    expect(
      (
        await request(setup.app, 'POST', orgUrl(setup, `/chats/${chatId}/restore`), {
          headers: as(setup),
        })
      ).statusCode,
    ).toBe(200)
    expect((await readThread(setup, chatId, 'adam')).statusCode).toBe(200)

    // a private chat is never shown through a share, and cannot be shared
    await setup.db.tenant(setup.a.id, (tx) =>
      tx.update(chats).set({ isPrivate: true }).where(eq(chats.id, chatId)),
    )
    expectError(await readThread(setup, chatId, 'adam'), 404, ERROR_CODES.CHAT_NOT_FOUND)
    expectError(
      await share(setup, chatId, [{ subjectType: 'user', userId: adam.id }]),
      422,
      ERROR_CODES.CHAT_PRIVATE_NOT_SHAREABLE,
    )
  })

  it('offers teams, then the other active members, as share targets', async () => {
    const { setup } = await sharedChat()
    const team = await createTeam(setup, 'Support', ['olivia'])
    const targets = (query: Record<string, string> = {}) =>
      request(setup.app, 'GET', orgUrl(setup, '/chat-share-targets'), {
        headers: as(setup),
        query,
      })
    const all = expectPage(await targets(), chatShareTargetDtoSchema).data
    expect(all[0]).toEqual({
      subjectType: 'team',
      team: { id: team.id, name: 'Support', memberCount: 1 },
    })
    const people = all.flatMap((row) => (row.subjectType === 'user' ? [row.user.id] : []))
    const { adam, olivia, uma } = setup.a.members
    expect(new Set(people)).toEqual(new Set([adam.id, olivia.id]))
    expect(people).not.toContain(uma.id)
    // matched on names and emails, a page at a time
    const found = expectPage(await targets({ q: adam.email }), chatShareTargetDtoSchema).data
    expect(found.map((row) => (row.subjectType === 'user' ? row.user.id : row.team.id))).toEqual([
      adam.id,
    ])
    const first = await targets({ limit: '1' })
    const page = expectPage(first, chatShareTargetDtoSchema)
    expect(page.data).toHaveLength(1)
    const cursor = page.nextCursor
    if (cursor === null) throw new Error('a second page')
    const second = expectPage(await targets({ limit: '2', cursor }), chatShareTargetDtoSchema).data
    expect(second).toHaveLength(2)

    await setSharing(setup, false)
    expectError(await targets(), 403, ERROR_CODES.CHAT_SHARING_DISABLED)
  })

  it('shares only with people and teams of the organization', async () => {
    const { setup, chatId } = await sharedChat()
    expectError(
      await share(setup, chatId, [{ subjectType: 'user', userId: setup.b.members.bea.id }]),
      422,
      ERROR_CODES.CHAT_SHARE_TARGET_NOT_FOUND,
    )
    expectError(
      await share(setup, chatId, [
        { subjectType: 'team', teamId: '0198a000-0000-7000-8000-00000000beef' },
      ]),
      422,
      ERROR_CODES.CHAT_SHARE_TARGET_NOT_FOUND,
    )
    // another person's chat is not found, not refused
    expectError(
      await share(setup, chatId, [{ subjectType: 'user', userId: setup.a.members.uma.id }], 'adam'),
      404,
      ERROR_CODES.CHAT_NOT_FOUND,
    )
  })
})
