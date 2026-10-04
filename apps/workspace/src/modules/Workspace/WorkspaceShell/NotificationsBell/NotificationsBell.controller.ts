// SPDX-License-Identifier: AGPL-3.0-only
import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { useTranslations } from 'next-intl'
import { useState } from 'react'

import {
  notificationQueries,
  useMarkAllNotificationsReadMutation,
  useMarkNotificationReadMutation,
} from '@/api/notifications'
import { useCurrentOrgId } from '@surefy/web-core/access'

import { NOTIFICATIONS_POPOVER_LIMIT, UNREAD_COUNT_REFRESH_MS } from '../../Workspace.constants'

/**
 * The bell: unread count (refreshed every minute) and, once opened, the latest items. A failed
 * count shows no badge rather than an error; the popover shows its own error state.
 */
export function useNotificationsBellController() {
  const t = useTranslations('workspace.notifications')
  const orgId = useCurrentOrgId()
  const [isOpen, setIsOpen] = useState(false)
  const { data: unread } = useQuery({
    ...notificationQueries.unreadCount(orgId),
    refetchInterval: UNREAD_COUNT_REFRESH_MS,
  })
  const latest = useInfiniteQuery({
    ...notificationQueries.list(orgId, { unreadOnly: false, limit: NOTIFICATIONS_POPOVER_LIMIT }),
    enabled: isOpen,
  })
  const { mutate: markRead } = useMarkNotificationReadMutation(orgId)
  const markAll = useMarkAllNotificationsReadMutation(orgId)

  const unreadCount = unread?.count ?? 0

  return {
    isOpen,
    setIsOpen,
    unreadCount,
    items: latest.data?.pages[0]?.items ?? [],
    isLoading: latest.isPending,
    isError: latest.isError,
    refetch: () => void latest.refetch(),
    onMarkRead: (notificationId: string) => {
      markRead(notificationId)
    },
    onMarkAllRead: () => {
      markAll.mutate()
    },
    isMarkingAll: markAll.isPending,
    onClose: () => {
      setIsOpen(false)
    },
    t,
  }
}
