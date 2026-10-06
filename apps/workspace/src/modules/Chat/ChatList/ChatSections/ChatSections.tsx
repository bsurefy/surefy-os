// SPDX-License-Identifier: AGPL-3.0-only
'use client'

import { SearchX } from 'lucide-react'
import { useNow, useTranslations } from 'next-intl'

import { EmptyState } from '@surefy/ui/components/DataDisplay'
import { ErrorState } from '@surefy/ui/components/Feedback'
import { LoadMore } from '@surefy/ui/components/Navigation'
import { Button } from '@surefy/ui/primitives/button'
import { Skeleton } from '@surefy/ui/primitives/skeleton'

import ChatGroup from '../ChatGroup'
import { groupChatsByDate } from '../ChatList.utils'

import type { ChatPages } from '../ChatList.hooks'
import type { ChatRowContext } from '../ChatRow'

const SKELETON_ROWS = 6

/** The loading state of the list: rows where the chats will be. */
export function ChatListSkeleton() {
  const t = useTranslations('chat.list')
  return (
    <div role="status" aria-label={t('loading')} className="flex flex-col gap-1 px-2">
      {Array.from({ length: SKELETON_ROWS }, (_, index) => (
        <Skeleton key={index} className="h-7 w-full" />
      ))}
    </div>
  )
}

/** Chats the person pinned, above the folders. Nothing is shown while there are none. */
export function PinnedChats({ pages, ctx }: Readonly<{ pages: ChatPages; ctx: ChatRowContext }>) {
  const t = useTranslations('chat.list')
  if (pages.chats.length === 0) return null
  return (
    <>
      <ChatGroup heading={t('pinned')} chats={pages.chats} ctx={ctx} />
      <LoadMore
        label={t('loadMore')}
        hasMore={pages.hasMore}
        isLoading={pages.isLoadingMore}
        onLoadMore={pages.onLoadMore}
      />
    </>
  )
}

/** Chats outside every folder, grouped by date (Today, Yesterday, Previous 7 days…). */
export function DatedChats({ pages, ctx }: Readonly<{ pages: ChatPages; ctx: ChatRowContext }>) {
  const t = useTranslations('chat.list')
  const now = useNow()
  return (
    <>
      {groupChatsByDate(pages.chats, now).map((group) => (
        <ChatGroup
          key={group.key}
          heading={t(`groups.${group.key}`)}
          chats={group.chats}
          ctx={ctx}
        />
      ))}
      <LoadMore
        label={t('loadMore')}
        hasMore={pages.hasMore}
        isLoading={pages.isLoadingMore}
        onLoadMore={pages.onLoadMore}
      />
    </>
  )
}

/** Matches in titles and message text, newest first, with the matching text under the title. */
export function SearchResults({
  pages,
  ctx,
  query,
  onClear,
}: Readonly<{ pages: ChatPages; ctx: ChatRowContext; query: string; onClear: () => void }>) {
  const t = useTranslations('chat.list')
  if (pages.isLoading) return <ChatListSkeleton />
  if (pages.errorMessage) {
    return (
      <ErrorState
        size="sm"
        headingLevel={3}
        message={pages.errorMessage}
        reference={pages.errorReference}
        onRetry={pages.refetch}
      />
    )
  }
  if (pages.chats.length === 0) {
    return (
      <EmptyState
        icon={SearchX}
        title={t('search.noResults.title')}
        description={t('search.noResults.description', { query })}
        headingLevel={3}
        secondaryAction={
          <Button variant="secondary" size="sm" onClick={onClear}>
            {t('search.clear')}
          </Button>
        }
      />
    )
  }
  return (
    <>
      <ChatGroup heading={t('search.results')} chats={pages.chats} ctx={ctx} />
      <LoadMore
        label={t('loadMore')}
        hasMore={pages.hasMore}
        isLoading={pages.isLoadingMore}
        onLoadMore={pages.onLoadMore}
      />
    </>
  )
}
