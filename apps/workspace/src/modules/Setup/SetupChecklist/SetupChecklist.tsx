// SPDX-License-Identifier: AGPL-3.0-only
'use client'

import { Check, X } from 'lucide-react'
import Link from 'next/link'

import { toRoute } from '@/modules/Workspace'
import { Button } from '@surefy/ui/primitives/button'

import { CHECKLIST_LINKS } from './SetupChecklist.constants'
import { useSetupChecklistController } from './SetupChecklist.controller'

/**
 * The setup checklist on the home screen (Chat's empty state) until it is done or dismissed:
 * connect a model, add documents, invite the team, create an agent, set a budget.
 */
export default function SetupChecklist({ orgSlug }: Readonly<{ orgSlug: string }>) {
  const c = useSetupChecklistController()
  const { t } = c
  if (!c.isVisible) return null

  return (
    <section
      aria-labelledby="setup-checklist-title"
      className="border-border bg-surface rounded-xl border p-4"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-0.5">
          <h2 id="setup-checklist-title" className="text-section-title">
            {t('title')}
          </h2>
          <p className="text-caption text-muted-foreground">
            {t('progress', { done: c.doneCount, total: c.items.length })}
          </p>
        </div>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={t('dismiss')}
          isLoading={c.isDismissing}
          onClick={c.onDismiss}
        >
          <X aria-hidden="true" />
        </Button>
      </div>
      <ul className="mt-3 flex flex-col gap-3">
        {c.items.map((item) => (
          <li key={item.key} className="flex items-start gap-3">
            <span
              aria-hidden="true"
              className={
                item.done
                  ? 'bg-success text-success-foreground mt-0.5 flex size-5 items-center justify-center rounded-full'
                  : 'border-input mt-0.5 size-5 rounded-full border'
              }
            >
              {item.done && <Check className="size-3" />}
            </span>
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <p className="text-body font-medium">
                {t(`items.${item.key}.title`)}
                {item.done && <span className="sr-only"> · {t('done')}</span>}
              </p>
              {!item.done && (
                <p className="text-caption text-muted-foreground">
                  {t(`items.${item.key}.description`)}
                </p>
              )}
            </div>
            {!item.done && (
              <Button variant="link" size="sm" asChild>
                <Link href={toRoute(CHECKLIST_LINKS[item.key](orgSlug))}>
                  {t(`items.${item.key}.action`)}
                </Link>
              </Button>
            )}
          </li>
        ))}
      </ul>
    </section>
  )
}
