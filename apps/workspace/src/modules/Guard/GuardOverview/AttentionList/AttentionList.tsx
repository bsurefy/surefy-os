// SPDX-License-Identifier: AGPL-3.0-only
'use client'

import { CircleCheck } from 'lucide-react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { useTranslations } from 'next-intl'

import { toRoute } from '@/modules/Workspace'
import type { GuardAttentionItemDto } from '@surefy/contracts'
import { Section } from '@surefy/ui/components/Layout'
import { Button } from '@surefy/ui/primitives/button'

import { getAttentionHref } from '../GuardOverview.utils'

/** "Needs your attention": each open item with a link to the queue, the rule or the agent. */
export default function AttentionList({ items }: Readonly<{ items: GuardAttentionItemDto[] }>) {
  const t = useTranslations('guard.overview.attention')
  const { orgSlug } = useParams<{ orgSlug: string }>()

  return (
    <Section title={t('title')} description={t('description')}>
      {items.length === 0 ? (
        <p className="text-body text-foreground-secondary flex items-center gap-2">
          <CircleCheck aria-hidden className="text-success size-4" />
          {t('empty')}
        </p>
      ) : (
        <ul className="divide-border flex flex-col divide-y">
          {items.map((item) => (
            <li
              key={`${item.kind}-${item.target.id ?? item.target.type}`}
              className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
            >
              <span className="text-body">{t(`kinds.${item.kind}`, { count: item.count })}</span>
              <Button variant="secondary" size="sm" asChild>
                <Link href={toRoute(getAttentionHref(item, orgSlug))}>
                  {t(`actions.${item.kind}`)}
                </Link>
              </Button>
            </li>
          ))}
        </ul>
      )}
    </Section>
  )
}
