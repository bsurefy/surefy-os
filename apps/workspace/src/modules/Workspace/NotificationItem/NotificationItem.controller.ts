// SPDX-License-Identifier: AGPL-3.0-only
import { useFormatter, useNow, useTranslations } from 'next-intl'

import { getNotificationHref } from './NotificationItem.utils'

import type { NotificationItemProps } from './NotificationItem.types'

export function useNotificationItemController({
  notification,
  orgSlug,
  onMarkRead,
  onOpen,
}: NotificationItemProps) {
  const t = useTranslations('workspace.notifications')
  const format = useFormatter()
  const now = useNow()
  const isUnread = notification.readAt === null

  const onFollow = () => {
    if (isUnread) onMarkRead(notification.id)
    onOpen?.()
  }

  return {
    title: t(`types.${notification.type}`),
    actorName: notification.actor?.name,
    time: format.relativeTime(new Date(notification.createdAt), now),
    href: getNotificationHref(notification.target, orgSlug),
    isUnread,
    onFollow,
    onMarkRead: () => {
      onMarkRead(notification.id)
    },
    t,
  }
}
