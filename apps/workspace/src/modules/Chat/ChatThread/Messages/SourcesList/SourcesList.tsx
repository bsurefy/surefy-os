// SPDX-License-Identifier: AGPL-3.0-only
'use client'

import { useTranslations } from 'next-intl'

import type { ThreadSource } from '../../ChatThread.types'

/** The "Sources" list under an answer: each numbered source opens the preview. */
export default function SourcesList({
  sources,
  onOpenSource,
}: Readonly<{ sources: readonly ThreadSource[]; onOpenSource: (index: number) => void }>) {
  const t = useTranslations('chat.thread.answer')
  if (sources.length === 0) return null
  return (
    <section aria-label={t('sources')} className="flex flex-col gap-1.5">
      <h3 className="text-label text-muted-foreground">{t('sources')}</h3>
      <ol className="flex flex-wrap gap-2">
        {sources.map((source) => (
          <li key={source.index}>
            <button
              type="button"
              className="border-border bg-surface hover:bg-surface-2 text-caption flex max-w-64 items-center gap-1.5 rounded-lg border px-2 py-1"
              aria-label={t('openSource', { index: source.index, title: source.title })}
              onClick={() => {
                onOpenSource(source.index)
              }}
            >
              <span aria-hidden className="bg-surface-2 rounded-full px-1.5">
                {source.index}
              </span>
              <span className="truncate">{source.title}</span>
              {source.page !== undefined && (
                <span className="text-muted-foreground shrink-0">
                  {t('page', { page: source.page })}
                </span>
              )}
            </button>
          </li>
        ))}
      </ol>
    </section>
  )
}
