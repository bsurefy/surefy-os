// SPDX-License-Identifier: AGPL-3.0-only
'use client'

import { CircleAlert, CircleCheck, TriangleAlert } from 'lucide-react'
import Link from 'next/link'
import { useFormatter, useTranslations } from 'next-intl'

import { toRoute } from '@/modules/Workspace'
import type { AgentReadinessDto, AgentReadinessItemDto } from '@surefy/contracts'
import { ErrorState, SkeletonRows } from '@surefy/ui/components/Feedback'
import { Section } from '@surefy/ui/components/Layout'
import { Button } from '@surefy/ui/primitives/button'

interface ReadinessSectionProps {
  readiness: AgentReadinessDto | undefined
  isLoading: boolean
  errorMessage: string | null
  errorReference: string | undefined
  onRetry: () => void
  /** Where an item is fixed: the editor tab's address. */
  tabHref: (tab: AgentReadinessItemDto['tab']) => string
}

const ICONS = {
  passed: { icon: CircleCheck, className: 'text-success' },
  blocking: { icon: CircleAlert, className: 'text-destructive' },
  warning: { icon: TriangleAlert, className: 'text-warning' },
} as const

/**
 * The readiness checklist: what stops a publish (blocking) and what is worth a look (warnings).
 * Each failing item says what is wrong and links to the tab that fixes it.
 */
export default function ReadinessSection({
  readiness,
  isLoading,
  errorMessage,
  errorReference,
  onRetry,
  tabHref,
}: Readonly<ReadinessSectionProps>) {
  const t = useTranslations('agents.editor.publish.readiness')
  const tTabs = useTranslations('agents.editor.tabs')
  const format = useFormatter()

  const blockers = readiness?.items.filter((item) => item.severity === 'blocking' && !item.passed)

  let summary = ''
  if (readiness) {
    summary = readiness.canPublish ? t('ready') : t('notReady', { count: blockers?.length ?? 0 })
  }

  let content
  if (errorMessage) {
    content = (
      <ErrorState
        title={t('loadError')}
        message={errorMessage}
        reference={errorReference}
        onRetry={onRetry}
      />
    )
  } else if (isLoading || !readiness) {
    content = <SkeletonRows rows={4} lines={1} />
  } else {
    content = (
      <ul className="flex flex-col gap-3">
        {readiness.items.map((item) => {
          const state = item.passed ? 'passed' : item.severity
          const { icon: Icon, className } = ICONS[state]
          const names = format.list(
            item.failures.map((failure) => failure.name),
            { type: 'conjunction' },
          )
          return (
            <li key={item.key} className="flex items-start gap-3">
              <Icon aria-hidden className={`mt-0.5 size-5 shrink-0 ${className}`} />
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="text-body text-foreground font-medium">
                  {t(`items.${item.key}.label`)}
                  <span className="sr-only">
                    {' · '}
                    {t(`state.${state}`)}
                  </span>
                </span>
                {!item.passed && (
                  <span className="text-body text-muted-foreground">
                    {t(`items.${item.key}.failed`, {
                      names,
                      count: item.failures.length,
                      kind: item.failures[0]?.type ?? '',
                    })}
                  </span>
                )}
              </div>
              {!item.passed && (
                <Button asChild variant="link" size="sm">
                  <Link href={toRoute(tabHref(item.tab))}>
                    {t('fix', { tab: tTabs(item.tab) })}
                  </Link>
                </Button>
              )}
            </li>
          )
        })}
      </ul>
    )
  }

  return (
    <Section title={t('title')} description={summary || t('description')}>
      {content}
    </Section>
  )
}
