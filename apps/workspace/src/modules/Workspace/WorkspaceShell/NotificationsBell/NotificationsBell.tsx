// SPDX-License-Identifier: AGPL-3.0-only
'use client'

import { Bell } from 'lucide-react'
import Link from 'next/link'

import { ROUTES } from '@/constants/routes'
import { SkeletonText } from '@surefy/ui/components/Feedback'
import { Button } from '@surefy/ui/primitives/button'
import { Popover, PopoverContent, PopoverTrigger } from '@surefy/ui/primitives/popover'

import { useNotificationsBellController } from './NotificationsBell.controller'
import NotificationItem from '../../NotificationItem'

const MAX_BADGE = 99

/** Top-bar bell with the unread count; the popover lists the latest items and links to all. */
export default function NotificationsBell({ orgSlug }: Readonly<{ orgSlug: string }>) {
  const {
    isOpen,
    setIsOpen,
    unreadCount,
    items,
    isLoading,
    isError,
    refetch,
    onMarkRead,
    onMarkAllRead,
    isMarkingAll,
    onClose,
    t,
  } = useNotificationsBellController()

  let body
  if (isLoading) body = <SkeletonText lines={4} className="p-2" />
  else if (isError) {
    body = (
      <div role="alert" className="flex flex-col items-start gap-2 p-2">
        <p className="text-body">{t('loadError')}</p>
        <Button variant="secondary" size="sm" onClick={refetch}>
          {t('retry')}
        </Button>
      </div>
    )
  } else if (items.length === 0) {
    body = <p className="text-body text-muted-foreground p-2">{t('empty.title')}</p>
  } else {
    body = (
      <ul className="flex flex-col">
        {items.map((notification) => (
          <NotificationItem
            key={notification.id}
            notification={notification}
            orgSlug={orgSlug}
            onMarkRead={onMarkRead}
            onOpen={onClose}
          />
        ))}
      </ul>
    )
  }

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="secondary"
          size="icon-md"
          aria-label={t('bellLabel', { count: unreadCount })}
          className="text-foreground-secondary relative"
        >
          <Bell aria-hidden="true" />
          {unreadCount > 0 && (
            <span
              aria-hidden="true"
              className="bg-primary text-primary-foreground ring-surface text-caption absolute top-1 right-1 flex h-4 min-w-4 items-center justify-center rounded-full px-1 font-semibold tabular-nums ring-2"
            >
              {unreadCount > MAX_BADGE ? `${MAX_BADGE}+` : unreadCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={8}
        className="w-[min(22.5rem,calc(100vw-2rem))] p-1.5"
      >
        <div className="flex h-9 items-center justify-between gap-2 px-2.5">
          <h2 className="text-section-title">{t('title')}</h2>
          {unreadCount > 0 && (
            <Button variant="link" size="sm" isLoading={isMarkingAll} onClick={onMarkAllRead}>
              {t('markAllRead')}
            </Button>
          )}
        </div>
        {body}
        <div className="border-border mt-1 border-t px-2.5 py-2">
          <Link
            href={ROUTES.workspace.notifications(orgSlug)}
            onClick={onClose}
            className="text-label text-primary hover:underline"
          >
            {t('seeAll')}
          </Link>
        </div>
      </PopoverContent>
    </Popover>
  )
}
