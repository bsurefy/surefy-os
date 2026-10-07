// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, it } from 'vitest'

import { QUEUES } from '@/constants/queues.js'
import { createQueues } from '@/core/queue/index.js'
import { notifications } from '@/database/tables/index.js'
import {
  ERROR_CODES,
  markAllReadResultDtoSchema,
  notificationDtoSchema,
  unreadCountDtoSchema,
} from '@surefy/contracts'

import { notificationFactory, RecordingMailProvider } from './notificationsTestKit.js'
import { newId, seedOrg } from '../../../../test/factories/index.js'
import { authHeaders, type AuthHeaders } from '../../../../test/helpers/auth.js'
import { onFileTeardown } from '../../../../test/helpers/cleanup.js'
import { expectData, expectError, expectPage, request } from '../../../../test/helpers/request.js'
import { createTestApp } from '../../../../test/helpers/testApp.js'
import { getTestDatabase } from '../../../../test/helpers/testDatabase.js'
import {
  assertRouteIsolation,
  assertTenantIsolation,
  checkCrossTenantCase,
  crossTenantCases,
  expectNoLeaks,
  type CrossTenantSubjects,
  type OrgScopedRoute,
} from '../../../../test/isolation/index.js'
import { createNotificationsModule } from '../notifications.module.js'

/** maya and omar are members of A, bea of B; seeded per test (tables are truncated). */
const orgs = { a: '', b: '' }
const people = { maya: '', omar: '', bea: '' }
const sessions = new Map<string, AuthHeaders>()

/** The session cookie of a person created by `setup()`. */
const sessionOf = (userId: string): AuthHeaders => {
  const headers = sessions.get(userId)
  if (headers === undefined) throw new Error('unknown test person')
  return headers
}

const setup = async () => {
  const { db, config, logger } = getTestDatabase()
  const queues = createQueues(config, logger)
  onFileTeardown(() => queues.close())
  const mail = new RecordingMailProvider()
  const { app, container } = await createTestApp()
  sessions.clear()
  const a = await seedOrg(container, { members: { maya: 'user', omar: 'user' } })
  const b = await seedOrg(container, { members: { bea: 'user' } })
  orgs.a = a.id
  orgs.b = b.id
  for (const member of [a.members.maya, a.members.omar, b.members.bea]) {
    sessions.set(member.id, await authHeaders(app, member))
  }
  people.maya = a.members.maya.id
  people.omar = a.members.omar.id
  people.bea = b.members.bea.id
  const module = createNotificationsModule({ config, db, queues, mail })
  return { app, db, queues, service: module.service }
}

const seed = (overrides: Parameters<typeof notificationFactory.build>[0] = {}) =>
  getTestDatabase().db.system('test', (tx) =>
    notificationFactory.create(tx, { organizationId: orgs.a, userId: people.maya, ...overrides }),
  )

const at = (minute: number) => new Date(Date.UTC(2026, 9, 1, 10, minute))
const url = (path = '') => `/api/v1/orgs/${orgs.a}/notifications${path}`

describe('GET /orgs/:orgId/notifications', () => {
  it("lists the member's notifications newest first, page by page", async () => {
    const { app } = await setup()
    const first = await seed({ createdAt: at(1) })
    const second = await seed({ createdAt: at(2) })
    const third = await seed({ createdAt: at(3) })
    await seed({ userId: people.omar }) // another member of A

    const headers = sessionOf(people.maya)
    const page1 = expectPage(
      await request(app, 'GET', url(), { headers, query: { limit: '2' } }),
      notificationDtoSchema,
    )
    expect(page1.data.map((n) => n.id)).toEqual([third.id, second.id])
    expect(page1.nextCursor).not.toBeNull()

    const page2 = expectPage(
      await request(app, 'GET', url(), {
        headers,
        query: { limit: '2', cursor: page1.nextCursor ?? '' },
      }),
      notificationDtoSchema,
    )
    expect(page2.data.map((n) => n.id)).toEqual([first.id])
    expect(page2.nextCursor).toBeNull()
  })

  it('keeps notifications created in the same instant on separate pages without gaps', async () => {
    const { app } = await setup()
    const created = [await seed({ createdAt: at(5) }), await seed({ createdAt: at(5) })]
    const headers = sessionOf(people.maya)
    const page1 = expectPage(
      await request(app, 'GET', url(), { headers, query: { limit: '1' } }),
      notificationDtoSchema,
    )
    const page2 = expectPage(
      await request(app, 'GET', url(), {
        headers,
        query: { limit: '1', cursor: page1.nextCursor ?? '' },
      }),
      notificationDtoSchema,
    )
    const byId = (a: string, b: string) => a.localeCompare(b)
    expect([...page1.data, ...page2.data].map((n) => n.id).sort(byId)).toEqual(
      created.map((n) => n.id).sort(byId),
    )
  })

  it('filters unread notifications and maps the DTO', async () => {
    const { app } = await setup()
    const unread = await seed()
    await seed({ readAt: new Date() })
    const page = expectPage(
      await request(app, 'GET', url(), {
        headers: sessionOf(people.maya),
        query: { unreadOnly: 'true' },
      }),
      notificationDtoSchema,
    )
    expect(page.data).toEqual([
      {
        id: unread.id,
        type: 'knowledge_source.ready',
        params: unread.params,
        target: { type: 'knowledge_source', id: unread.targetId },
        actor: null,
        readAt: null,
        createdAt: unread.createdAt.toISOString(),
      },
    ])
  })

  it('rejects an invalid query and a forged cursor', async () => {
    const { app } = await setup()
    const headers = sessionOf(people.maya)
    expectError(
      await request(app, 'GET', url(), { headers, query: { limit: '0' } }),
      422,
      ERROR_CODES.VALIDATION_FAILED,
    )
    expectError(
      await request(app, 'GET', url(), { headers, query: { cursor: 'forged' } }),
      400,
      ERROR_CODES.BAD_REQUEST,
    )
  })

  it('needs a signed-in person', async () => {
    const { app } = await setup()
    expectError(await request(app, 'GET', url()), 401, ERROR_CODES.AUTH_UNAUTHENTICATED)
    expectError(
      await request(app, 'GET', url(), { headers: { cookie: 'surefy.session_token=forged' } }),
      401,
      ERROR_CODES.AUTH_UNAUTHENTICATED,
    )
  })
})

describe('GET /orgs/:orgId/notifications/unread-count', () => {
  it("counts only the member's unread notifications", async () => {
    const { app } = await setup()
    await seed()
    await seed()
    await seed({ readAt: new Date() })
    await seed({ userId: people.omar })
    const count = expectData(
      await request(app, 'GET', url('/unread-count'), { headers: sessionOf(people.maya) }),
      200,
      unreadCountDtoSchema,
    )
    expect(count).toEqual({ count: 2 })
  })
})

describe('POST /orgs/:orgId/notifications/:notificationId/read', () => {
  it('marks it read once and keeps the first read time', async () => {
    const { app } = await setup()
    const notification = await seed()
    const headers = sessionOf(people.maya)
    const first = expectData(
      await request(app, 'POST', url(`/${notification.id}/read`), { headers }),
      200,
      notificationDtoSchema,
    )
    expect(first.readAt).not.toBeNull()
    const again = expectData(
      await request(app, 'POST', url(`/${notification.id}/read`), { headers }),
      200,
      notificationDtoSchema,
    )
    expect(again.readAt).toBe(first.readAt)
  })

  it("answers 404 for another member's notification, an unknown id or a malformed id", async () => {
    const { app } = await setup()
    const omars = await seed({ userId: people.omar })
    const headers = sessionOf(people.maya)
    for (const id of [omars.id, newId()]) {
      expectError(
        await request(app, 'POST', url(`/${id}/read`), { headers }),
        404,
        ERROR_CODES.NOTIFICATION_NOT_FOUND,
      )
    }
    expectError(
      await request(app, 'POST', url('/not-a-uuid/read'), { headers }),
      422,
      ERROR_CODES.VALIDATION_FAILED,
    )
    const unread = await getTestDatabase().db.system('test', (tx) =>
      tx.select({ readAt: notifications.readAt }).from(notifications),
    )
    expect(unread.every((row) => row.readAt === null)).toBe(true)
  })
})

describe('POST /orgs/:orgId/notifications/read-all', () => {
  it("marks every unread notification of the member and nobody else's", async () => {
    const { app } = await setup()
    await seed()
    await seed()
    await seed({ readAt: new Date() })
    await seed({ userId: people.omar })
    const headers = sessionOf(people.maya)
    const result = expectData(
      await request(app, 'POST', url('/read-all'), { headers }),
      200,
      markAllReadResultDtoSchema,
    )
    expect(result).toEqual({ affected: 2 })
    const omar = expectData(
      await request(app, 'GET', url('/unread-count'), { headers: sessionOf(people.omar) }),
      200,
      unreadCountDtoSchema,
    )
    expect(omar).toEqual({ count: 1 })
    expect(
      expectData(
        await request(app, 'POST', url('/read-all'), { headers }),
        200,
        markAllReadResultDtoSchema,
      ),
    ).toEqual({ affected: 0 })
  })
})

describe('tenant isolation', () => {
  const routes: OrgScopedRoute[] = [
    { method: 'GET', path: '/orgs/:orgId/notifications' },
    { method: 'GET', path: '/orgs/:orgId/notifications/unread-count' },
    { method: 'POST', path: '/orgs/:orgId/notifications/read-all' },
  ]

  const subjectsFor = (notification: {
    id: string
    targetId: string | null
  }): CrossTenantSubjects => ({
    orgA: {
      id: orgs.a,
      params: { notificationId: notification.id },
      markers: [notification.id, notification.targetId ?? '', 'Source'],
    },
    orgB: { id: orgs.b, session: sessionOf(people.bea) },
  })

  it("keeps A's notification out of reach of B's member on the resource route", async () => {
    const { app } = await setup()
    const notification = await seed()
    await expect(
      assertRouteIsolation(
        app,
        { method: 'POST', path: '/orgs/:orgId/notifications/:notificationId/read' },
        subjectsFor(notification),
      ),
    ).resolves.toBeUndefined()
  })

  it.each(routes)(
    "answers 404 ORGANIZATION_NOT_FOUND on A's $method $path to B's member",
    async (route) => {
      const { app } = await setup()
      const notification = await seed()
      const subjects = subjectsFor(notification)
      // The organization-level case; B's own feed is checked for leaks below.
      const cases = crossTenantCases(route, subjects).filter((c) => c.expected.code !== undefined)
      for (const testCase of cases) {
        expect(await checkCrossTenantCase(app, testCase, subjects.orgA.markers)).toEqual([])
      }
      const own = await request(
        app,
        route.method,
        `/api/v1${route.path.replace(':orgId', orgs.b)}`,
        {
          headers: subjects.orgB.session,
        },
      )
      expect(own.statusCode).toBe(200)
      expectNoLeaks(own, subjects.orgA.markers)
    },
  )

  it('holds at the database layer (tenant policy, FORCE RLS)', async () => {
    await setup()
    await expect(
      assertTenantIsolation(
        getTestDatabase().db,
        {
          table: notifications,
          organizationId: notifications.organizationId,
          row: (orgId) =>
            notificationFactory.build({
              organizationId: orgId,
              userId: orgId === orgs.a ? people.maya : people.bea,
            }),
        },
        orgs,
      ),
    ).resolves.toBeUndefined()
  })
})

describe('NotificationsService producers', () => {
  it('writes a notification once per dedupe key and shows it in the feed', async () => {
    const { app, service } = await setup()
    const input = {
      userId: people.maya,
      type: 'export.ready' as const,
      params: { version: 1 as const, fileName: 'chats.zip' },
      target: { type: 'export' as const, id: newId() },
      dedupeKey: 'export-ready-1',
    }
    const written = await service.notify({ orgId: orgs.a }, input)
    expect(written).toMatchObject({ type: 'export.ready', target: input.target, readAt: null })
    expect(await service.notify({ orgId: orgs.a }, input)).toBeNull()

    const page = expectPage(
      await request(app, 'GET', url(), { headers: sessionOf(people.maya) }),
      notificationDtoSchema,
    )
    expect(page.data.map((n) => n.id)).toEqual([written?.id])
  })

  it('queues an email on the email queue, once per job ID', async () => {
    const { service, queues } = await setup()
    const payload = {
      template: 'verifyEmail' as const,
      to: 'maya@example.test',
      url: 'https://app.example.test/verify?token=abc',
    }
    const queue = queues.get(QUEUES.EMAIL)
    const { waiting = 0 } = await queue.getJobCounts('waiting') // setup's verification emails
    const jobId = await service.queueEmail(payload, { jobId: 'verify-maya' })
    await service.queueEmail(payload, { jobId: 'verify-maya' })
    expect(jobId).toBe('verify-maya')
    expect(await queue.getJobCounts('waiting')).toEqual({ waiting: waiting + 1 })
    expect((await queue.getJob(jobId))?.data).toEqual(payload)
  })
})
