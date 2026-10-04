// SPDX-License-Identifier: AGPL-3.0-only
import { PERMISSIONS } from '@surefy/contracts'

import {
  listNotificationsRoute,
  markAllNotificationsReadRoute,
  markNotificationReadRoute,
  unreadCountRoute,
} from './notifications.schema.js'

import type { NotificationsController } from './notifications.controller.js'
import type { NotificationsRouteAccess } from './notifications.types.js'
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'

export function notificationsRoutes(
  controller: NotificationsController,
  access: NotificationsRouteAccess,
): FastifyPluginAsyncZod {
  return (app) => {
    const preHandler = access.authorize(PERMISSIONS.NOTIFICATIONS_READ)
    app.get(
      '/orgs/:orgId/notifications',
      { schema: listNotificationsRoute, preHandler },
      controller.list,
    )
    app.get(
      '/orgs/:orgId/notifications/unread-count',
      { schema: unreadCountRoute, preHandler },
      controller.unreadCount,
    )
    app.post(
      '/orgs/:orgId/notifications/read-all',
      { schema: markAllNotificationsReadRoute, preHandler },
      controller.markAllRead,
    )
    app.post(
      '/orgs/:orgId/notifications/:notificationId/read',
      { schema: markNotificationReadRoute, preHandler },
      controller.markRead,
    )
    return Promise.resolve()
  }
}
