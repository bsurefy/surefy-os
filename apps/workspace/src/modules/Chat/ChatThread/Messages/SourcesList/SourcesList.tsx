// SPDX-License-Identifier: AGPL-3.0-only
'use client'

import { useTranslations } from 'next-intl'

import { MonoTile } from '@surefy/ui/components/DataDisplay'

import type { ThreadSource } from '../../ChatThread.types'

/** The sources under an answer, as numbered cards: each opens the preview. */
export default function SourcesList({
  sources,
  onOpenSource,
}: Readonly<{ sources: readonly ThreadSource[]; onOpenSource: (index: number) => void }>) {
  const t = useTranslations('chat.thread.answer')
  if (sources.length === 0) return null
  return (
    <section aria-label={t('sources')} className="flex flex-col gap-1.5">
      <h3 className="text-overline text-muted-foreground">{t('sourcesFromKnowledge')}</h3>
      <ol className="grid gap-2 sm:grid-cols-2">
        {sources.map((source) => (
          <li key={source.index} className="min-w-0">
            <button
              type="button"
              className="border-border bg-surface hover:border-input hover:bg-surface-2 duration-fast flex w-full min-w-0 items-center gap-2.5 rounded-lg border py-1.5 pr-3 pl-1.5 text-left transition-colors"
              aria-label={t('openSource', { index: source.index, title: source.title })}
              onClick={() => {
                onOpenSource(source.index)
              }}
            >
              <MonoTile
                size="sm"
                className="bg-primary-soft text-primary-soft-foreground border-transparent"
              >
                {String(source.index)}
              </MonoTile>
              <span className="flex min-w-0 flex-col">
                <span className="text-label truncate font-medium">{source.title}</span>
                {source.page !== undefined && (
                  <span className="text-caption text-muted-foreground">
                    {t('page', { page: source.page })}
                  </span>
                )}
              </span>
            </button>
          </li>
        ))}
      </ol>
    </section>
  )
}
