// SPDX-License-Identifier: AGPL-3.0-only
import { createLoader, parseAsStringLiteral } from 'nuqs/server'

export const NOTIFICATION_FILTERS = ['all', 'unread'] as const
export type NotificationFilter = (typeof NOTIFICATION_FILTERS)[number]

/** `?show=unread`: the filter survives a reload and can be shared. */
export const notificationsSearchParams = {
  show: parseAsStringLiteral(NOTIFICATION_FILTERS).withDefault('all'),
}

/** The page reads the same filter on the server, so its prefetch matches the client's query. */
export const loadNotificationFilters = createLoader(notificationsSearchParams)
