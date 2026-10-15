// SPDX-License-Identifier: AGPL-3.0-only
'use client'

import { useInfiniteQuery } from '@tanstack/react-query'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { useId } from 'react'

import { chatQueries } from '@/api/chats'
import { ROUTES } from '@/constants/routes'
import { toRoute } from '@/modules/Workspace'
import { LoadMore } from '@surefy/ui/components/Navigation'
import { cn } from '@surefy/ui/lib/utils'

/**
 * "Shared with me" (chat.md §1): chats others shared with the person or their teams, newest
 * message first, each with who owns it. They open view only. Hidden while there are none.
 */
export default function SharedSection({
  orgId,
  orgSlug,
  openChatId,
}: Readonly<{ orgId: string; orgSlug: string; openChatId: string | undefined }>) {
  const t = useTranslations('chat.list.shared')
  const tList = useTranslations('chat.list')
  const headingId = useId()
  const list = useInfiniteQuery(chatQueries.sharedList(orgId, {}))
  const chats = list.data?.pages.flatMap((page) => page.items) ?? []
  if (chats.length === 0) return null

  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-0.5">
      <h3 id={headingId} className="text-overline text-muted-foreground px-2 pt-2 pb-1">
        {t('title')}
      </h3>
      <ul className="flex flex-col gap-0.5">
        {chats.map((chat) => {
          const isActive = chat.id === openChatId
          return (
            <li key={chat.id}>
              <Link
                href={toRoute(ROUTES.workspace.chat(orgSlug, chat.id))}
                aria-current={isActive ? 'page' : undefined}
                className={cn(
                  'text-label hover:bg-surface-2 flex min-w-0 flex-col justify-center rounded-md px-2 py-1.5',
                  isActive &&
                    'bg-primary-soft text-primary-soft-foreground hover:bg-primary-soft font-medium',
                )}
              >
                <span className="truncate">{chat.title || tList('untitled')}</span>
                {chat.owner && (
                  <span className="text-caption text-muted-foreground truncate">
                    {t('by', { name: chat.owner.name })}
                  </span>
                )}
              </Link>
            </li>
          )
        })}
      </ul>
      <LoadMore
        label={tList('loadMore')}
        hasMore={list.hasNextPage}
        isLoading={list.isFetchingNextPage}
        onLoadMore={() => void list.fetchNextPage()}
      />
    </section>
  )
}
