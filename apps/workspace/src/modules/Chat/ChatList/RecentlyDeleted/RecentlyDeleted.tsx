// SPDX-License-Identifier: AGPL-3.0-only
'use client'

import { ArrowLeft, Trash2 } from 'lucide-react'
import { useFormatter, useNow, useTranslations } from 'next-intl'

import { useRestorePromptMutation } from '@/api/prompts'
import type { ChatDto, PromptDto } from '@surefy/contracts'
import { EmptyState } from '@surefy/ui/components/DataDisplay'
import { ErrorState, toast } from '@surefy/ui/components/Feedback'
import { LoadMore } from '@surefy/ui/components/Navigation'
import { Button } from '@surefy/ui/primitives/button'

import { usePromptPages } from '../../PromptLibrary'
import { useChatPages } from '../ChatList.hooks'
import { getDaysLeft } from '../ChatList.utils'
import { ChatListSkeleton } from '../ChatSections'

import type { ChatActions } from '../ChatList.hooks'

/** Recently deleted: the person's own deleted chats, each with its days left and Restore (T0). */
export default function RecentlyDeleted({
  orgId,
  actions,
  onBack,
}: Readonly<{ orgId: string; actions: ChatActions; onBack: () => void }>) {
  const t = useTranslations('chat.list.deleted')
  const tList = useTranslations('chat.list')
  const format = useFormatter()
  const now = useNow()
  const pages = useChatPages(orgId, { state: 'deleted', sort: '-deletedAt' })
  const promptPages = usePromptPages(orgId, { state: 'deleted', sort: '-deletedAt' })
  const restorePrompt = useRestorePromptMutation(orgId)

  const restoreItem = (prompt: PromptDto) => {
    restorePrompt.mutate(prompt.id, {
      onSuccess: () => {
        toast.success(t('promptRestored'))
      },
    })
  }

  const renderPrompt = (prompt: PromptDto) => (
    <li key={prompt.id} className="flex items-center gap-2 rounded-lg px-2 py-1.5">
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="text-body truncate">{prompt.title}</span>
        <span className="text-caption text-muted-foreground truncate">
          {t('deletedOn', {
            date: prompt.deletedAt
              ? format.dateTime(new Date(prompt.deletedAt), { month: 'short', day: 'numeric' })
              : '',
            days: getDaysLeft(prompt.purgeAt, now),
          })}
        </span>
      </div>
      {prompt.canEdit && (
        <Button
          variant="secondary"
          size="sm"
          aria-label={t('restorePrompt', { title: prompt.title })}
          onClick={() => {
            restoreItem(prompt)
          }}
        >
          {t('restore')}
        </Button>
      )}
    </li>
  )

  const renderChat = (chat: ChatDto) => (
    <li key={chat.id} className="flex items-center gap-2 rounded-lg px-2 py-1.5">
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="text-body truncate">{chat.title || tList('untitled')}</span>
        <span className="text-caption text-muted-foreground truncate">
          {t('deletedOn', {
            date: chat.deletedAt
              ? format.dateTime(new Date(chat.deletedAt), { month: 'short', day: 'numeric' })
              : '',
            days: getDaysLeft(chat.purgeAt, now),
          })}
        </span>
      </div>
      <Button
        variant="secondary"
        size="sm"
        aria-label={t('restoreChat', { title: chat.title || tList('untitled') })}
        onClick={() => {
          actions.onRestore(chat)
        }}
      >
        {t('restore')}
      </Button>
    </li>
  )

  let body
  if (pages.isLoading || promptPages.isLoading) body = <ChatListSkeleton />
  else if (pages.errorMessage) {
    body = (
      <ErrorState
        size="sm"
        headingLevel={3}
        message={pages.errorMessage}
        reference={pages.errorReference}
        onRetry={pages.refetch}
      />
    )
  } else if (pages.chats.length === 0 && promptPages.prompts.length === 0) {
    body = (
      <EmptyState
        icon={Trash2}
        title={t('empty.title')}
        description={t('empty.description')}
        headingLevel={3}
      />
    )
  } else {
    body = (
      <>
        {pages.chats.length > 0 && (
          <ul aria-label={t('chats')} className="flex flex-col gap-0.5">
            {pages.chats.map(renderChat)}
          </ul>
        )}
        <LoadMore
          label={tList('loadMore')}
          hasMore={pages.hasMore}
          isLoading={pages.isLoadingMore}
          onLoadMore={pages.onLoadMore}
        />
        {promptPages.prompts.length > 0 && (
          <ul aria-label={t('prompts')} className="flex flex-col gap-0.5">
            {promptPages.prompts.map(renderPrompt)}
          </ul>
        )}
        <LoadMore
          label={tList('loadMore')}
          hasMore={promptPages.hasMore}
          isLoading={promptPages.isLoadingMore}
          onLoadMore={promptPages.onLoadMore}
        />
      </>
    )
  }

  return (
    <section aria-label={t('title')} className="flex flex-col gap-3">
      <div className="flex items-center gap-1">
        <Button variant="ghost" size="icon-sm" aria-label={t('back')} onClick={onBack}>
          <ArrowLeft aria-hidden />
        </Button>
        <h3 className="text-label font-medium">{t('title')}</h3>
      </div>
      <p className="text-caption text-muted-foreground px-2">{t('description')}</p>
      {body}
    </section>
  )
}
