// SPDX-License-Identifier: AGPL-3.0-only
'use client'

import { BellRing, CheckCheck } from 'lucide-react'

import { EmptyState } from '@surefy/ui/components/DataDisplay'
import { ErrorState, SkeletonText } from '@surefy/ui/components/Feedback'
import { SegmentedControl } from '@surefy/ui/components/Forms'
import { PageHeader } from '@surefy/ui/components/Layout'
import { LoadMore } from '@surefy/ui/components/Navigation'
import { Button } from '@surefy/ui/primitives/button'

import NotificationItem from '../NotificationItem'
import { useNotificationCenterController } from './NotificationCenter.controller'

import type { NotificationCenterProps } from './NotificationCenter.types'

/** Every notification of the person in this organization, newest first, with mark-as-read. */
export default function NotificationCenter(props: Readonly<NotificationCenterProps>) {
  const c = useNotificationCenterController(props)
  const { t } = c

  let content
  if (c.isLoading) content = <SkeletonText lines={6} />
  else if (c.errorMessage) {
    content = (
      <ErrorState
        title={t('loadError')}
        message={c.errorMessage}
        reference={c.errorReference}
        onRetry={c.refetch}
      />
    )
  } else if (c.items.length === 0) {
    content = c.isUnreadFilter ? (
      <EmptyState
        icon={CheckCheck}
        title={t('emptyUnread.title')}
        description={t('emptyUnread.description')}
        actionLabel={t('emptyUnread.showAll')}
        onAction={c.onShowAll}
      />
    ) : (
      <EmptyState icon={BellRing} title={t('empty.title')} description={t('empty.description')} />
    )
  } else {
    content = (
      <>
        <ul aria-label={t('title')} className="flex flex-col">
          {c.items.map((notification) => (
            <NotificationItem
              key={notification.id}
              notification={notification}
              orgSlug={props.orgSlug}
              density="comfortable"
              onMarkRead={c.onMarkRead}
            />
          ))}
        </ul>
        <LoadMore
          label={t('loadMore')}
          onLoadMore={c.onLoadMore}
          isLoading={c.isLoadingMore}
          hasMore={c.hasMore}
        />
      </>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t('title')}
        description={t('description')}
        actions={
          c.canMarkAll ? (
            <Button
              variant="secondary"
              icon={CheckCheck}
              isLoading={c.isMarkingAll}
              onClick={c.onMarkAllRead}
            >
              {t('markAllRead')}
            </Button>
          ) : undefined
        }
      />
      <SegmentedControl
        label={t('filterLabel')}
        options={c.filterOptions}
        value={c.filter}
        onValueChange={c.onFilterChange}
        className="self-start"
      />
      <section aria-busy={c.isLoading || undefined}>{content}</section>
    </div>
  )
}
