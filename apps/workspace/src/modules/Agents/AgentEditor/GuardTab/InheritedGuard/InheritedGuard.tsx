// SPDX-License-Identifier: AGPL-3.0-only
'use client'

import { Lock } from 'lucide-react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { useTranslations } from 'next-intl'

import { ROUTES } from '@/constants/routes'
import { toRoute } from '@/modules/Workspace'
import type { GuardRuleRowDto, GuardSettingsDto } from '@surefy/contracts'
import { StatusPill } from '@surefy/ui/components/DataDisplay'
import { ErrorState, SkeletonRows } from '@surefy/ui/components/Feedback'
import { Section } from '@surefy/ui/components/Layout'
import { Button } from '@surefy/ui/primitives/button'

import { toPercent } from '../GuardTab.utils'

interface InheritedGuardProps {
  settings: GuardSettingsDto | null
  rules: readonly GuardRuleRowDto[]
  isLoading: boolean
  errorMessage: string | null
  errorReference: string | undefined
  onRetry: () => void
}

/**
 * What the organization's Guard already decides for every agent, as locked rows: the thresholds and
 * the organization and team rules. An agent can add to these and be stricter, never turn one off.
 */
export default function InheritedGuard({
  settings,
  rules,
  isLoading,
  errorMessage,
  errorReference,
  onRetry,
}: Readonly<InheritedGuardProps>) {
  const t = useTranslations('agents.editor.guard.inherited')
  const { orgSlug } = useParams<{ orgSlug: string }>()

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
  } else if (isLoading || !settings) {
    content = <SkeletonRows rows={3} lines={1} />
  } else {
    content = (
      <ul className="flex flex-col gap-2">
        <li className="border-border flex items-start gap-3 rounded-lg border px-3 py-2">
          <Lock aria-hidden className="text-muted-foreground mt-0.5 size-4 shrink-0" />
          <div className="flex min-w-0 flex-1 flex-col">
            <span className="text-body text-foreground font-medium">{t('thresholds.name')}</span>
            <span className="text-caption text-muted-foreground">
              {t('thresholds.value', {
                auto: toPercent(settings.autoThresholdBp),
                review: toPercent(settings.reviewThresholdBp),
              })}
            </span>
          </div>
          <span className="text-caption text-muted-foreground shrink-0">{t('fromGuard')}</span>
        </li>
        {rules.map((rule) => (
          <li
            key={rule.id}
            className="border-border flex items-start gap-3 rounded-lg border px-3 py-2"
          >
            <Lock aria-hidden className="text-muted-foreground mt-0.5 size-4 shrink-0" />
            <div className="flex min-w-0 flex-1 flex-col">
              <span className="text-body text-foreground font-medium">{rule.name}</span>
              <span className="text-caption text-muted-foreground">
                {t(`types.${rule.type}`)}
                {' · '}
                {rule.team ? t('scope.team', { team: rule.team.name }) : t('scope.organization')}
                {rule.isLocked && rule.lockedReason
                  ? ` · ${t('lockedBy', { name: rule.lockedBy?.name ?? t('anOwner'), reason: rule.lockedReason })}`
                  : ''}
              </span>
            </div>
            {!rule.isEnabled && <StatusPill tone="neutral" label={t('off')} />}
          </li>
        ))}
        {rules.length === 0 && <li className="text-body text-muted-foreground">{t('noRules')}</li>}
      </ul>
    )
  }

  return (
    <Section
      title={t('title')}
      description={t('description')}
      actions={
        <Button asChild variant="link" size="sm">
          <Link href={toRoute(ROUTES.workspace.guard(orgSlug))}>{t('open')}</Link>
        </Button>
      }
    >
      {content}
    </Section>
  )
}
