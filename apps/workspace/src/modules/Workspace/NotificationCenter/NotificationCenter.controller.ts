// SPDX-License-Identifier: AGPL-3.0-only
import { useInfiniteQuery } from '@tanstack/react-query'
import { useTranslations } from 'next-intl'
import { useQueryStates } from 'nuqs'

import {
  notificationQueries,
  useMarkAllNotificationsReadMutation,
  useMarkNotificationReadMutation,
} from '@/api/notifications'
import { isApiError, getErrorMessage } from '@surefy/web-core/errors'

import { NOTIFICATION_FILTERS, notificationsSearchParams } from './NotificationCenter.searchParams'

import type { NotificationFilter } from './NotificationCenter.searchParams'
import type { NotificationCenterProps } from './NotificationCenter.types'

export function useNotificationCenterController({ orgId }: NotificationCenterProps) {
  const t = useTranslations('workspace.notifications')
  const tErrors = useTranslations('errors')
  const [{ show }, setFilters] = useQueryStates(notificationsSearchParams)
  const unreadOnly = show === 'unread'
  const list = useInfiniteQuery(notificationQueries.list(orgId, { unreadOnly }))
  const { mutate: markRead } = useMarkNotificationReadMutation(orgId)
  const markAll = useMarkAllNotificationsReadMutation(orgId)

  const items = list.data?.pages.flatMap((page) => page.items) ?? []

  return {
    items,
    isLoading: list.isPending,
    errorMessage: list.error ? getErrorMessage(list.error, tErrors) : null,
    errorReference: isApiError(list.error) ? list.error.requestId : undefined,
    refetch: () => void list.refetch(),
    hasMore: list.hasNextPage,
    isLoadingMore: list.isFetchingNextPage,
    onLoadMore: () => void list.fetchNextPage(),
    filter: show,
    filterOptions: NOTIFICATION_FILTERS.map((value) => ({ value, label: t(`filter.${value}`) })),
    onFilterChange: (value: NotificationFilter) => void setFilters({ show: value }),
    onShowAll: () => void setFilters({ show: 'all' }),
    isUnreadFilter: unreadOnly,
    // From the page's own (server-prefetched) list, so server and client render the same
    canMarkAll: items.some((item) => item.readAt === null),
    onMarkAllRead: () => {
      markAll.mutate()
    },
    isMarkingAll: markAll.isPending,
    onMarkRead: (notificationId: string) => {
      markRead(notificationId)
    },
    t,
  }
}
