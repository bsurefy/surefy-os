// SPDX-License-Identifier: AGPL-3.0-only
import {
  ERROR_CODES,
  markAllReadResultDtoSchema,
  notificationDtoSchema,
  okResponse,
  PAGE_SIZE,
  pageResponse,
  unreadCountDtoSchema,
} from '@surefy/contracts'
import type { NotificationDto } from '@surefy/contracts'
import { defineFactory, fixtureUuid } from '@surefy/web-core/testing'
import {
  defineMockDomain,
  defineMockHandler,
  mockError,
  mockOk,
  mockPage,
} from '@surefy/web-core/testing/mock'

import { MAYA, OMAR } from './shell.fixtures'

const NOTIFICATION_KIND = 20
const HTTP_NOT_FOUND = 404

/** A notification of the signed-in member; unread, with no actor, unless overridden. */
export const notificationFactory = defineFactory(
  notificationDtoSchema,
  (sequence): NotificationDto => ({
    id: fixtureUuid(NOTIFICATION_KIND, sequence),
    type: 'knowledge_source.ready',
    params: { version: 1 },
    target: null,
    actor: null,
    readAt: null,
    createdAt: '2026-01-15T08:00:00.000Z',
  }),
)

const target = (type: NonNullable<NotificationDto['target']>['type'], sequence: number) => ({
  type,
  id: fixtureUuid(NOTIFICATION_KIND + 1, sequence),
})

function seedNotifications(): NotificationDto[] {
  return [
    notificationFactory({
      type: 'approval.requested',
      target: target('approval', 1),
      actor: OMAR,
      createdAt: '2026-01-15T08:55:00.000Z',
    }),
    notificationFactory({
      type: 'knowledge_source.ready',
      target: target('knowledge_source', 2),
      createdAt: '2026-01-15T08:40:00.000Z',
    }),
    notificationFactory({
      type: 'budget.threshold_reached',
      target: target('budget', 3),
      createdAt: '2026-01-15T07:10:00.000Z',
    }),
    notificationFactory({
      type: 'chat.shared',
      target: target('chat', 4),
      actor: OMAR,
      readAt: '2026-01-14T17:00:00.000Z',
      createdAt: '2026-01-14T16:30:00.000Z',
    }),
    notificationFactory({
      type: 'export.ready',
      target: target('export', 5),
      actor: MAYA,
      readAt: '2026-01-14T12:00:00.000Z',
      createdAt: '2026-01-14T11:00:00.000Z',
    }),
    notificationFactory({
      type: 'connection.expired',
      target: target('connection', 6),
      readAt: '2026-01-13T10:00:00.000Z',
      createdAt: '2026-01-13T09:00:00.000Z',
    }),
    notificationFactory({
      type: 'organization.deletion_scheduled',
      target: null,
      readAt: '2026-01-12T10:00:00.000Z',
      createdAt: '2026-01-12T09:00:00.000Z',
    }),
  ]
}

// The dev mock server keeps read marks in memory, so marking read shows at once.
let notifications = seedNotifications()

/** Back to the seeded notifications; tests call it between cases. */
export function resetNotificationsMock(): void {
  notifications = seedNotifications()
}

const READ_AT = '2026-01-15T09:00:00.000Z'

function markRead(notification: NotificationDto): NotificationDto {
  return notification.readAt === null ? { ...notification, readAt: READ_AT } : notification
}

function listPage(url: URL) {
  const unreadOnly = url.searchParams.get('unreadOnly') === 'true'
  const limit = Number(url.searchParams.get('limit') ?? PAGE_SIZE.default)
  const start = Number(url.searchParams.get('cursor') ?? 0)
  const items = notifications.filter((item) => !unreadOnly || item.readAt === null)
  const page = items.slice(start, start + limit)
  const next = start + limit < items.length ? String(start + limit) : null
  return mockPage(page, next)
}

const path = '/orgs/:orgId/notifications'

/**
 * In-app notifications (B2-01's routes), live on the real API (I4-08; the handlers stay for
 * component tests and for `MOCK_DOMAINS=notifications`, to look at the states). Every built-in
 * scenario applies; `empty` also zeroes the bell.
 */
export const notificationsDomain = defineMockDomain(
  'notifications',
  [
    defineMockHandler({
      method: 'get',
      path,
      response: pageResponse(notificationDtoSchema),
      scenarios: { default: ({ request }) => listPage(new URL(request.url)) },
    }),
    defineMockHandler({
      method: 'get',
      path: `${path}/unread-count`,
      response: okResponse(unreadCountDtoSchema),
      scenarios: {
        default: () =>
          mockOk({ count: notifications.filter((item) => item.readAt === null).length }),
        empty: () => mockOk({ count: 0 }),
      },
    }),
    defineMockHandler({
      method: 'post',
      path: `${path}/:notificationId/read`,
      response: okResponse(notificationDtoSchema),
      scenarios: {
        default: ({ params }) => {
          const found = notifications.find((item) => item.id === params.notificationId)
          if (!found) {
            return mockError(HTTP_NOT_FOUND, ERROR_CODES.NOTIFICATION_NOT_FOUND, 'Not found')
          }
          const read = markRead(found)
          notifications = notifications.map((item) => (item.id === read.id ? read : item))
          return mockOk(read)
        },
      },
    }),
    defineMockHandler({
      method: 'post',
      path: `${path}/read-all`,
      response: okResponse(markAllReadResultDtoSchema),
      scenarios: {
        default: () => {
          const affected = notifications.filter((item) => item.readAt === null).length
          notifications = notifications.map(markRead)
          return mockOk({ affected })
        },
      },
    }),
  ],
  { isLive: true },
)
