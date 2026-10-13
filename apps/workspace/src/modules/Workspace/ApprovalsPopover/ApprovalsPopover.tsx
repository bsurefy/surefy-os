// SPDX-License-Identifier: AGPL-3.0-only
'use client'

import { ListChecks } from 'lucide-react'
import Link from 'next/link'
import { useFormatter, useNow } from 'next-intl'

import { ROUTES } from '@/constants/routes'
import { SkeletonText } from '@surefy/ui/components/Feedback'
import { Button } from '@surefy/ui/primitives/button'
import { Popover, PopoverContent, PopoverTrigger } from '@surefy/ui/primitives/popover'

import { toRoute } from '../Workspace.utils'
import { useApprovalsPopoverController } from './ApprovalsPopover.controller'
import ApprovalsPopoverItem from './ApprovalsPopoverItem'

const MAX_BADGE = 99

/**
 * The top-bar approvals button with the count of items this person can decide. The popover is
 * review-first: the oldest five with confidence, amount and rule; Review opens the approval and
 * Approve appears only for items inside the quick-approve limit, with a six-second Undo.
 */
export default function ApprovalsPopover({ orgSlug }: Readonly<{ orgSlug: string }>) {
  const c = useApprovalsPopoverController()
  const format = useFormatter()
  const now = useNow()
  const { t } = c

  if (!c.isAvailable) return null

  let body
  if (c.isLoading) body = <SkeletonText lines={4} className="p-2" />
  else if (c.isError) {
    body = (
      <div role="alert" className="flex flex-col items-start gap-2 p-2">
        <p className="text-body">{t('loadError')}</p>
        <Button variant="secondary" size="sm" onClick={c.refetch}>
          {t('retry')}
        </Button>
      </div>
    )
  } else if (c.items.length === 0) {
    body = <p className="text-body text-muted-foreground p-2">{t('empty.title')}</p>
  } else {
    body = (
      <ul className="flex flex-col">
        {c.items.map((item) => (
          <ApprovalsPopoverItem
            key={item.id}
            item={item}
            orgSlug={orgSlug}
            format={format}
            now={now}
            onApprove={c.onApprove}
            onReview={c.onClose}
          />
        ))}
      </ul>
    )
  }

  return (
    <Popover open={c.isOpen} onOpenChange={c.setIsOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="secondary"
          size="icon-md"
          aria-label={t('buttonLabel', { count: c.count })}
          className="text-foreground-secondary relative"
        >
          <ListChecks aria-hidden="true" />
          {c.count > 0 && (
            <span
              aria-hidden="true"
              className="bg-primary text-primary-foreground ring-surface text-caption absolute -top-1.5 -right-1.5 flex h-4 min-w-4 items-center justify-center rounded-full px-1 font-semibold tabular-nums ring-2"
            >
              {c.count > MAX_BADGE ? `${MAX_BADGE}+` : c.count}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" sideOffset={8} className="w-[min(25rem,calc(100vw-2rem))] p-1.5">
        <div className="flex h-9 items-center px-2.5">
          <h2 className="text-section-title">{t('title')}</h2>
        </div>
        {body}
        <div className="border-border mt-1 border-t px-2.5 py-2">
          <Link
            href={toRoute(ROUTES.workspace.insights(orgSlug, 'approvals'))}
            onClick={c.onClose}
            className="text-label text-primary hover:underline"
          >
            {t('seeAll')}
          </Link>
        </div>
      </PopoverContent>
    </Popover>
  )
}
