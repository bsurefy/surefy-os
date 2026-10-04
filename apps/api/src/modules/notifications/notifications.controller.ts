// SPDX-License-Identifier: AGPL-3.0-only
import type {
  listNotificationsRoute,
  markAllNotificationsReadRoute,
  markNotificationReadRoute,
  unreadCountRoute,
} from './notifications.schema.js'
import type { NotificationsService } from './notifications.service.js'
import type { NotificationsRouteAccess } from './notifications.types.js'
import type { ZodReply, ZodRequest } from '@/types/fastify.js'

type ListNotifications = typeof listNotificationsRoute
type UnreadCount = typeof unreadCountRoute
type MarkRead = typeof markNotificationReadRoute
type MarkAllRead = typeof markAllNotificationsReadRoute

export class NotificationsController {
  constructor(
    private readonly notificationsService: NotificationsService,
    private readonly access: NotificationsRouteAccess,
  ) {}

  list = async (request: ZodRequest<ListNotifications>, reply: ZodReply<ListNotifications>) => {
    const { items, nextCursor } = await this.notificationsService.list(
      this.access.context(request),
      request.query,
    )
    reply.page(items, nextCursor)
  }

  unreadCount = async (request: ZodRequest<UnreadCount>, reply: ZodReply<UnreadCount>) => {
    reply.ok(await this.notificationsService.unreadCount(this.access.context(request)))
  }

  markRead = async (request: ZodRequest<MarkRead>, reply: ZodReply<MarkRead>) => {
    const notification = await this.notificationsService.markRead(
      this.access.context(request),
      request.params.notificationId,
    )
    reply.ok(notification)
  }

  markAllRead = async (request: ZodRequest<MarkAllRead>, reply: ZodReply<MarkAllRead>) => {
    reply.ok(await this.notificationsService.markAllRead(this.access.context(request)))
  }
}
