// SPDX-License-Identifier: AGPL-3.0-only
'use client'

import Link from 'next/link'

import { cn } from '@surefy/ui/lib/utils'
import { Button } from '@surefy/ui/primitives/button'

import { toRoute } from '../Workspace.utils'
import { useNotificationItemController } from './NotificationItem.controller'

import type { NotificationItemProps } from './NotificationItem.types'

/** One notification: what happened, who, when; unread items carry a dot and a word. */
export default function NotificationItem(props: Readonly<NotificationItemProps>) {
  const { density = 'compact' } = props
  const { title, actorName, time, href, isUnread, onFollow, onMarkRead, t } =
    useNotificationItemController(props)
  const titleClass = cn(
    'text-body',
    isUnread ? 'text-foreground font-medium' : 'text-foreground-secondary',
  )

  return (
    <li
      className={cn(
        'flex items-start gap-3 rounded-md',
        density === 'compact' ? 'px-2 py-2' : 'border-border border-b px-1 py-3 last:border-b-0',
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          'mt-1.5 size-2 shrink-0 rounded-full',
          isUnread ? 'bg-primary' : 'bg-transparent',
        )}
      />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        {isUnread && <span className="sr-only">{t('unread')}</span>}
        {href ? (
          <Link
            href={toRoute(href)}
            onClick={onFollow}
            className={cn(
              titleClass,
              'focus-visible:ring-ring rounded-sm outline-none hover:underline focus-visible:ring-2',
            )}
          >
            {title}
          </Link>
        ) : (
          <span className={titleClass}>{title}</span>
        )}
        <span className="text-caption text-muted-foreground">
          {actorName ? t('meta', { actor: actorName, time }) : time}
        </span>
      </div>
      {isUnread && density === 'comfortable' && (
        <Button variant="ghost" size="sm" onClick={onMarkRead}>
          {t('markRead')}
        </Button>
      )}
    </li>
  )
}
