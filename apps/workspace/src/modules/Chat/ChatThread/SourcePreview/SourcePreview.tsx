// SPDX-License-Identifier: AGPL-3.0-only
'use client'

import { useQuery } from '@tanstack/react-query'
import Link from 'next/link'
import { useTranslations } from 'next-intl'

import { chatQueries } from '@/api/chats'
import { ROUTES } from '@/constants/routes'
import { toRoute } from '@/modules/Workspace'
import { ErrorState, Spinner } from '@surefy/ui/components/Feedback'
import { SidePanel } from '@surefy/ui/components/Overlay'
import { Button } from '@surefy/ui/primitives/button'

export interface SourcePreviewTarget {
  messageId: string
  index: number
  title: string
}

/**
 * The side sheet a citation opens: the cited passage with its document and page. It asks the
 * server again, so a source that was removed, or that the person may no longer read, says so while
 * the title from the answer stays.
 */
export default function SourcePreview({
  orgId,
  orgSlug,
  chatId,
  target,
  onClose,
}: Readonly<{
  orgId: string
  orgSlug: string
  chatId: string
  target: SourcePreviewTarget
  onClose: () => void
}>) {
  const t = useTranslations('chat.thread.preview')
  const query = useQuery(chatQueries.sourcePreview(orgId, chatId, target.messageId, target.index))
  const source = query.data

  return (
    <SidePanel
      open
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
      title={target.title}
      description={t('citation', { index: target.index })}
      footer={
        source?.status === 'available' && source.canOpenInKnowledge && source.knowledgeBaseId ? (
          <Button variant="secondary" asChild>
            <Link href={toRoute(ROUTES.workspace.knowledgeBase(orgSlug, source.knowledgeBaseId))}>
              {t('openInKnowledge')}
            </Link>
          </Button>
        ) : undefined
      }
    >
      {query.isPending && (
        <p role="status" className="text-body text-muted-foreground flex items-center gap-2">
          <Spinner size="sm" />
          {t('loading')}
        </p>
      )}
      {query.isError && (
        <ErrorState size="sm" message={t('error')} onRetry={() => void query.refetch()} />
      )}
      {source?.status === 'available' && (
        <div className="flex flex-col gap-3">
          {source.page !== null && (
            <p className="text-caption text-muted-foreground">{t('page', { page: source.page })}</p>
          )}
          <blockquote className="border-border text-body border-l-2 pl-3">
            {source.passage}
          </blockquote>
          {source.kind === 'web' && source.url && (
            <Button variant="link" asChild className="w-fit">
              <a href={source.url} target="_blank" rel="noopener noreferrer">
                {t('openLink')}
              </a>
            </Button>
          )}
        </div>
      )}
      {source?.status === 'removed' && <p className="text-body">{t('removed')}</p>}
      {source?.status === 'no_access' && <p className="text-body">{t('noAccess')}</p>}
    </SidePanel>
  )
}
