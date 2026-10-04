// SPDX-License-Identifier: AGPL-3.0-only
import type {
  NotificationParams,
  NotificationTargetType,
  NotificationType,
  Permission,
  UserRefDto,
} from '@surefy/contracts'

import type { FastifyRequest, preHandlerAsyncHookHandler } from 'fastify'

/**
 * What the service needs from the request's `TenantContext`: the verified organization and the
 * signed-in person (`null` for API keys and system actors, who have no notifications).
 */
export interface NotificationsContext {
  orgId: string
  userId: string | null
}

/**
 * The access layer the routes use: the session and access plugins provide it. `authorize` is the
 * route's guard (membership of `:orgId` and the permission); `context` reads what it verified.
 */
export interface NotificationsRouteAccess {
  authorize(permission: Permission): preHandlerAsyncHookHandler
  context(request: FastifyRequest): NotificationsContext
}

/** Display data of the people who caused notifications, from the module that owns `users`. */
export interface UserRefLookup {
  findUserRefs(userIds: readonly string[]): Promise<ReadonlyMap<string, UserRefDto>>
}

/** What a producing module passes to `NotificationsService.notify`. */
export interface NotifyInput {
  /** The recipient: a member of the context's organization. */
  userId: string
  type: NotificationType
  params: NotificationParams
  target?: { type: NotificationTargetType; id: string }
  /** Who caused it, when a person did. */
  actorUserId?: string
  /** Producer key so a retried job does not notify twice (unique per recipient). */
  dedupeKey?: string
}
