// SPDX-License-Identifier: AGPL-3.0-only
'use client'

import { BookOpen, FileText, Lightbulb, Mail } from 'lucide-react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'

import { ROUTES } from '@/constants/routes'
import { SetupChecklist } from '@/modules/Setup'
import { toRoute } from '@/modules/Workspace'
import { Button } from '@surefy/ui/primitives/button'

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
  canManageVault: boolean
  onSuggestion: (key: SuggestionKey) => void
}

/**
 * A new chat: a greeting, four starters and the setup checklist. With no model connected it says
 * what to do instead: Admins open Vault, everyone else asks an Admin.
 */
export default function EmptyThread({
  orgSlug,
  hasModels,
  canManageVault,
  onSuggestion,
}: Readonly<EmptyThreadProps>) {
  const t = useTranslations('chat.thread.empty')

  return (
    <div className="mx-auto flex w-full max-w-[760px] flex-col gap-6 py-8">
      <div className="flex flex-col gap-1.5">
        <h1 className="text-page-title">{t('title')}</h1>
        <p className="text-body text-muted-foreground">{t('description')}</p>
      </div>
      {hasModels === false ? (
        <section className="border-border bg-surface flex flex-col gap-2 rounded-xl border p-4">
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
        <ul aria-label={t('suggestions')} className="grid gap-3 sm:grid-cols-2">
          {SUGGESTIONS.map((key) => {
            const Icon = ICONS[key]
            return (
              <li key={key}>
                <button
                  type="button"
                  className="border-border bg-surface hover:bg-surface-2 flex h-full w-full flex-col items-start gap-1 rounded-xl border p-4 text-left"
                  onClick={() => {
                    onSuggestion(key)
                  }}
                >
                  <Icon aria-hidden className="text-muted-foreground size-5" />
                  <span className="text-body font-medium">{t(`cards.${key}.title`)}</span>
                  <span className="text-caption text-muted-foreground">
                    {t(`cards.${key}.description`)}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
      <SetupChecklist orgSlug={orgSlug} />
    </div>
  )
}
