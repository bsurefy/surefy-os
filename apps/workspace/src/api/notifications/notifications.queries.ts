// SPDX-License-Identifier: AGPL-3.0-only
import { infiniteQueryOptions, queryOptions } from '@tanstack/react-query'

import { PAGE_SIZE } from '@surefy/contracts'
import { apiClient } from '@surefy/web-core/http'
import type { HttpClient } from '@surefy/web-core/http'

import { notificationsApi } from './notifications.api'

export interface NotificationListFilters {
  unreadOnly: boolean
  limit?: number
}

export const notificationKeys = {
  all: (orgId: string) => ['orgs', orgId, 'notifications'] as const,
  lists: (orgId: string) => [...notificationKeys.all(orgId), 'list'] as const,
  list: (orgId: string, filters: NotificationListFilters) =>
    [...notificationKeys.lists(orgId), filters] as const,
  unreadCount: (orgId: string) => [...notificationKeys.all(orgId), 'unread-count'] as const,
}

// `http` defaults to the browser client; server components pass getServerHttpClient()
export const notificationQueries = {
  list: (orgId: string, filters: NotificationListFilters, http: HttpClient = apiClient) =>
    infiniteQueryOptions({
      queryKey: notificationKeys.list(orgId, filters),
      queryFn: ({ pageParam, signal }) =>
        notificationsApi.list(
          http,
          orgId,
          {
            limit: filters.limit ?? PAGE_SIZE.default,
            cursor: pageParam,
            unreadOnly: filters.unreadOnly || undefined,
          },
          signal,
        ),
      initialPageParam: undefined as string | undefined,
      getNextPageParam: (last) => last.nextCursor ?? undefined,
    }),
  unreadCount: (orgId: string, http: HttpClient = apiClient) =>
    queryOptions({
      queryKey: notificationKeys.unreadCount(orgId),
      queryFn: ({ signal }) => notificationsApi.unreadCount(http, orgId, signal),
    }),
}
