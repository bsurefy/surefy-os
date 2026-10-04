// SPDX-License-Identifier: AGPL-3.0-only
import type { NotificationDto } from '@surefy/contracts'

export interface NotificationItemProps {
  notification: NotificationDto
  orgSlug: string
  /** `compact` in the bell's popover, `comfortable` on the Notifications page. */
  density?: 'compact' | 'comfortable'
  /** Opening an unread notification marks it read. */
  onMarkRead: (notificationId: string) => void
  /** Called after the notification's link is followed (the popover closes). */
  onOpen?: () => void
}
