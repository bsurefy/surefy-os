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

/** Rows per group, like Today and Previous 7 days. */
const SKELETON_GROUPS = [4, 3] as const

/** The loading state of the list: rows where the chats will be. */
export function ChatListSkeleton() {
  const t = useTranslations('chat.list')
  return (
    <div role="status" aria-label={t('loading')} className="flex flex-col gap-4 px-2">
      {SKELETON_GROUPS.map((rows, group) => (
        <div key={group} className="flex flex-col gap-1">
          <Skeleton className="mb-1 h-2.5 w-12" />
          {Array.from({ length: rows }, (_, index) => (
            <div key={index} className="flex h-8 items-center px-2">
              <Skeleton className={index % 2 === 0 ? 'h-3.5 w-4/5' : 'h-3.5 w-3/5'} />
            </div>
          ))}
        </div>
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
