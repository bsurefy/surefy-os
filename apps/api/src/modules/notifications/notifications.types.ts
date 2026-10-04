// SPDX-License-Identifier: AGPL-3.0-only
import type {
  NotificationParams,
  NotificationTargetType,
  NotificationType,
  UserRefDto,
} from '@surefy/contracts'

import type { SendEmailPayload } from './notifications.schema.js'

/**
 * What the service needs from the request's `TenantContext`: the verified organization and the
 * signed-in person (`null` for API keys and system actors, who have no notifications).
 */
export interface NotificationsContext {
  orgId: string
  userId: string | null
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

/**
 * Hears how a queued email ended: `sent`, or `failed` after a refusal or the last attempt. The
 * members module records invitation delivery with it.
 */
export type EmailDeliveryListener = (outcome: {
  payload: SendEmailPayload
  status: 'sent' | 'failed'
}) => Promise<void>
