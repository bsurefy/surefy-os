// SPDX-License-Identifier: AGPL-3.0-only
import type {
  listNotificationsRoute,
  markAllNotificationsReadRoute,
  markNotificationReadRoute,
  unreadCountRoute,
} from './notifications.schema.js'
import type { NotificationsService } from './notifications.service.js'
import type { NotificationsContext } from './notifications.types.js'
import type { ZodReply, ZodRequest } from '@/types/fastify.js'
import type { FastifyRequest } from 'fastify'

type ListNotifications = typeof listNotificationsRoute
type UnreadCount = typeof unreadCountRoute
type MarkRead = typeof markNotificationReadRoute
type MarkAllRead = typeof markAllNotificationsReadRoute

/** The verified organization and the person (`null` for API keys) from `request.tenant`. */
const contextOf = (request: FastifyRequest): NotificationsContext => ({
  orgId: request.tenant.orgId,
  userId: request.tenant.userId,
})

export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  list = async (request: ZodRequest<ListNotifications>, reply: ZodReply<ListNotifications>) => {
    const { items, nextCursor } = await this.notificationsService.list(
      contextOf(request),
      request.query,
    )
    reply.page(items, nextCursor)
  }

  unreadCount = async (request: ZodRequest<UnreadCount>, reply: ZodReply<UnreadCount>) => {
    reply.ok(await this.notificationsService.unreadCount(contextOf(request)))
  }

  markRead = async (request: ZodRequest<MarkRead>, reply: ZodReply<MarkRead>) => {
    const notification = await this.notificationsService.markRead(
      contextOf(request),
      request.params.notificationId,
    )
    reply.ok(notification)
  }

  markAllRead = async (request: ZodRequest<MarkAllRead>, reply: ZodReply<MarkAllRead>) => {
    reply.ok(await this.notificationsService.markAllRead(contextOf(request)))
  }
}
