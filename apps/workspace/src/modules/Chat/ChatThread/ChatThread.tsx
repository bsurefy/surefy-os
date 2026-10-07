// SPDX-License-Identifier: AGPL-3.0-only
'use client'

import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { Fragment } from 'react'

import { ROUTES } from '@/constants/routes'
import { toRoute } from '@/modules/Workspace'
import { ErrorState, SkeletonText } from '@surefy/ui/components/Feedback'
import { Button } from '@surefy/ui/primitives/button'
import { Skeleton } from '@surefy/ui/primitives/skeleton'

import { useChatThreadController } from './ChatThread.controller'
import ThreadView from './ThreadView'

/**
 * A chat: the empty new chat, or one conversation (chat.md). It loads the chat and its latest
 * messages first; a chat that is deleted or not shared with the person is "not available", never
 * revealing whether it exists.
 */
export default function ChatThread() {
  const c = useChatThreadController()
  const t = useTranslations('chat.thread')

  if (c.state === 'loading') {
    return (
      <div aria-busy="true" className="flex min-h-0 flex-1 flex-col">
        <div className="border-border flex h-14 shrink-0 items-center gap-2.5 border-b px-4 md:px-5">
          <Skeleton className="h-4 w-48" />
          <Skeleton className="ml-auto size-9 rounded-lg" />
        </div>
        <div className="min-h-0 flex-1 overflow-hidden px-4 pt-6 pb-4 md:px-6">
          <div className="mx-auto flex w-full max-w-[760px] flex-col gap-6">
            {[0, 1].map((pair) => (
              <Fragment key={pair}>
                <Skeleton className="h-9 w-56 self-end rounded-xl" />
                <div className="flex flex-col gap-3">
                  <div className="flex items-center gap-2">
                    <Skeleton className="size-[1.375rem] rounded-full" />
                    <Skeleton className="h-3.5 w-32" />
                  </div>
                  <SkeletonText lines={3} />
                </div>
              </Fragment>
            ))}
          </div>
        </div>
        <div className="bg-background shrink-0 px-4 pt-2 pb-4 md:px-6">
          <div className="border-border bg-surface mx-auto h-24 w-full max-w-[760px] rounded-[0.875rem] border" />
        </div>
      </div>
    )
  }

  if (c.state === 'not-found') {
    return (
      <div className="mx-auto flex w-full max-w-[760px] flex-col items-start gap-3 px-6 py-12">
        <h1 className="text-page-title">{t('notFound.title')}</h1>
        <p className="text-body text-muted-foreground">{t('notFound.description')}</p>
        <Button asChild>
          <Link href={toRoute(ROUTES.workspace.chat(c.orgSlug))}>{t('notFound.action')}</Link>
        </Button>
      </div>
    )
  }

  if (c.state === 'error') {
    return (
      <div className="p-6">
        <ErrorState title={t('error.title')} message={t('error.message')} onRetry={c.onRetry} />
      </div>
    )
  }

  return (
    <ThreadView
      key={c.chatId}
      orgId={c.orgId}
      orgSlug={c.orgSlug}
      chatId={c.chatId}
      isNew={c.isNew}
      chat={c.chat}
      history={c.history}
      hasEarlier={c.hasEarlier}
      isLoadingEarlier={c.isLoadingEarlier}
      onLoadEarlier={c.onLoadEarlier}
      refetchHistory={c.refetchHistory}
    />
  )
}
