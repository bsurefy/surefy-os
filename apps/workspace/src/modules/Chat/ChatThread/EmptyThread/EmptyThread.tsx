// SPDX-License-Identifier: AGPL-3.0-only
'use client'

import { BookOpen, FileText, Lightbulb, Mail } from 'lucide-react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'

import { ROUTES } from '@/constants/routes'
import { SetupChecklist } from '@/modules/Setup'
import { toRoute } from '@/modules/Workspace'
import { BrandMark, IconTile } from '@surefy/ui/components/DataDisplay'
import { Button } from '@surefy/ui/primitives/button'
import { Skeleton } from '@surefy/ui/primitives/skeleton'

import { SUGGESTIONS } from '../ChatThread.constants'

import type { SuggestionKey } from '../ChatThread.constants'

const ICONS = {
  knowledge: BookOpen,
  summarize: FileText,
  draft: Mail,
  explain: Lightbulb,
} satisfies Record<SuggestionKey, typeof BookOpen>

export interface EmptyThreadProps {
  orgSlug: string
  /** `undefined` while the models load. */
  hasModels: boolean | undefined
  /** The model a message would go to; null while none is chosen. */
  modelName: string | null
  canManageVault: boolean
  onSuggestion: (key: SuggestionKey) => void
}

/**
 * A new chat: the mark, a greeting naming the model, four starters and the setup checklist. With
 * no model connected it says what to do instead: Admins open Vault, everyone else asks an Admin.
 */
export default function EmptyThread({
  orgSlug,
  hasModels,
  modelName,
  canManageVault,
  onSuggestion,
}: Readonly<EmptyThreadProps>) {
  const t = useTranslations('chat.thread.empty')

  return (
    <div className="mx-auto flex w-full max-w-[720px] flex-col gap-7 pt-6 md:pt-16">
      <div className="flex flex-col items-center gap-3 text-center">
        <BrandMark size={44} />
        <h1 className="text-page-title">{t('title')}</h1>
        {hasModels === undefined ? (
          <Skeleton aria-hidden className="h-4 w-80 max-w-full" />
        ) : (
          <p className="text-body text-foreground-secondary">
            {modelName
              ? t.rich('usingModel', {
                  model: modelName,
                  b: (chunks) => <b className="text-foreground font-semibold">{chunks}</b>,
                })
              : t('description')}
          </p>
        )}
      </div>
      {hasModels === false ? (
        <section className="border-border bg-surface flex flex-col gap-2 rounded-xl border p-5">
          <h2 className="text-section-title">{t('noModel.title')}</h2>
          <p className="text-body text-muted-foreground">
            {canManageVault ? t('noModel.admin') : t('noModel.member')}
          </p>
          {canManageVault && (
            <Button asChild className="w-fit">
              <Link href={toRoute(ROUTES.workspace.vault(orgSlug))}>{t('noModel.open')}</Link>
            </Button>
          )}
        </section>
      ) : (
        <ul aria-label={t('suggestions')} className="grid gap-2.5 sm:grid-cols-2">
          {SUGGESTIONS.map((key) => (
            <li key={key}>
              <button
                type="button"
                className="border-border bg-surface hover:border-input duration-fast flex h-full w-full items-start gap-3 rounded-xl border px-4 py-3.5 text-left transition-[border-color,box-shadow] hover:shadow-sm"
                onClick={() => {
                  onSuggestion(key)
                }}
              >
                <IconTile icon={ICONS[key]} size="sm" />
                <span className="flex min-w-0 flex-col gap-0.5">
                  <span className="text-label font-semibold">{t(`cards.${key}.title`)}</span>
                  <span className="text-caption text-muted-foreground">
                    {t(`cards.${key}.description`)}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <SetupChecklist orgSlug={orgSlug} />
    </div>
  )
}
