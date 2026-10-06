// SPDX-License-Identifier: AGPL-3.0-only
'use client'

import Link from 'next/link'
import { useTranslations } from 'next-intl'

import { ROUTES } from '@/constants/routes'
import { toRoute } from '@/modules/Workspace'
import { ErrorState, SkeletonCard, SkeletonText } from '@surefy/ui/components/Feedback'
import { Button } from '@surefy/ui/primitives/button'

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
      <div aria-busy="true" className="mx-auto flex w-full max-w-[760px] flex-col gap-6 px-6 py-8">
        <SkeletonText lines={2} />
        <SkeletonCard lines={4} />
        <SkeletonText lines={3} />
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
