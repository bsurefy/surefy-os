// SPDX-License-Identifier: AGPL-3.0-only
'use client'

import { Download } from 'lucide-react'
import { useTranslations } from 'next-intl'

import type { KnowledgeBaseDto, KnowledgeSourceDto } from '@surefy/contracts'
import { StatusPill } from '@surefy/ui/components/DataDisplay'
import { ErrorState } from '@surefy/ui/components/Feedback'
import { LoadMore } from '@surefy/ui/components/Navigation'
import { SidePanel } from '@surefy/ui/components/Overlay'
import { Button } from '@surefy/ui/primitives/button'
import { Skeleton } from '@surefy/ui/primitives/skeleton'

import { splitPassages } from '../Knowledge.utils'
import { useSourcePreviewController } from './SourcePreview.controller'

const TONES = {
  pending: 'info',
  parsing: 'info',
  embedding: 'info',
  ready: 'success',
  failed: 'destructive',
} as const

/**
 * Source preview: a sheet with the extracted text by page, the passage boundaries on hover and
 * focus, the status, how often answers used it, who can search it, and Download when allowed.
 */
export default function SourcePreview({
  orgId,
  base,
  source,
  onClose,
}: Readonly<{
  orgId: string
  base: KnowledgeBaseDto
  source: KnowledgeSourceDto
  onClose: () => void
}>) {
  const c = useSourcePreviewController(orgId, base.id, source)
  const t = useTranslations('knowledge.preview')
  const tReasons = useTranslations('knowledge.detail.sources.reasons')

  const document = c.detail?.document
  let body
  if (c.isLoadingDocuments || c.isLoadingDetail) {
    body = (
      <div role="status" aria-label={t('loading')} className="flex flex-col gap-3">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-40 w-full" />
      </div>
    )
  } else if (c.errorMessage) {
    body = <ErrorState size="sm" message={c.errorMessage} reference={c.errorReference} />
  } else if (!document) {
    body = <p className="text-body text-muted-foreground">{t('noDocuments')}</p>
  } else if (document.status === 'failed') {
    body = (
      <p className="text-body text-destructive">
        {document.errorCode ? tReasons(document.errorCode) : t('failed')}
      </p>
    )
  } else if (document.status !== 'ready') {
    body = <p className="text-body text-muted-foreground">{t('notReady')}</p>
  } else {
    body = (
      <>
        <div className="flex flex-col gap-4">
          {c.pages.map((page, index) => (
            <section
              key={page.page ?? `text-${index}`}
              aria-label={page.page ? t('page', { page: page.page }) : t('text')}
              className="flex flex-col gap-1"
            >
              {page.page && (
                <h3 className="text-caption text-muted-foreground font-medium">
                  {t('page', { page: page.page })}
                </h3>
              )}
              <p className="text-body whitespace-pre-wrap">
                {splitPassages(page.text, page.passages).map((segment, at) =>
                  segment.passageOrdinal === null ? (
                    <span key={at}>{segment.text}</span>
                  ) : (
                    <span
                      key={at}

                      tabIndex={0}
                      title={t('passage', { number: segment.passageOrdinal + 1 })}
                      className="focus-visible:bg-accent hover:bg-accent focus-visible:outline-ring rounded-sm"
                    >
                      {segment.text}
                    </span>
                  ),
                )}
              </p>
            </section>
          ))}
        </div>
        {c.pages.length === 0 && !c.isLoadingPages && (
          <p className="text-body text-muted-foreground">{t('noText')}</p>
        )}
        <LoadMore
          label={t('loadMore')}
          hasMore={c.hasMorePages}
          isLoading={c.isLoadingMorePages}
          onLoadMore={c.onLoadMorePages}
        />
      </>
    )
  }

  return (
    <SidePanel
      open
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
      title={source.name}
      description={t('description')}
      size="lg"
      footer={
        c.detail?.canDownload ? (
          <Button
            variant="secondary"
            icon={Download}
            isLoading={c.isDownloading}
            onClick={c.onDownload}
          >
            {t('download')}
          </Button>
        ) : undefined
      }
    >
      <div className="flex flex-col gap-4">
        {c.documents.length > 1 && (
          <nav aria-label={t('documents')} className="flex flex-col gap-1">
            <h3 className="text-label font-medium">{t('documents')}</h3>
            <ul className="flex max-h-40 flex-col gap-0.5 overflow-y-auto">
              {c.documents.map((item) => (
                <li key={item.id}>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full justify-start"
                    aria-pressed={item.id === c.documentId}
                    onClick={() => {
                      c.onChooseDocument(item.id)
                    }}
                  >
                    {item.title}
                  </Button>
                </li>
              ))}
            </ul>
            <LoadMore
              label={t('loadMoreDocuments')}
              hasMore={c.hasMoreDocuments}
              onLoadMore={c.onLoadMoreDocuments}
            />
          </nav>
        )}
        {document && c.detail && (
          <dl className="text-body grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
            <dt className="text-muted-foreground">{t('status')}</dt>
            <dd>
              <StatusPill tone={TONES[document.status]} label={t(`statuses.${document.status}`)} />
            </dd>
            <dt className="text-muted-foreground">{t('usedInAnswers')}</dt>
            <dd>{t('usedCount', { count: document.citationCount })}</dd>
            <dt className="text-muted-foreground">{t('whoCanSearch')}</dt>
            <dd>
              {c.detail.whoCanSearch.teams.length + c.detail.whoCanSearch.userCount === 0
                ? t('adminsOnly')
                : [
                    ...c.detail.whoCanSearch.teams.map((team) => team.name),
                    ...(c.detail.whoCanSearch.userCount > 0
                      ? [t('people', { count: c.detail.whoCanSearch.userCount })]
                      : []),
                  ].join(', ')}
            </dd>
          </dl>
        )}
        {body}
      </div>
    </SidePanel>
  )
}
