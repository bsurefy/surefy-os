// SPDX-License-Identifier: AGPL-3.0-only
'use client'

import Link from 'next/link'
import { useTranslations } from 'next-intl'

import { ROUTES } from '@/constants/routes'
import { toRoute } from '@/modules/Workspace'
import { Banner } from '@surefy/ui/components/Feedback'
import { Button } from '@surefy/ui/primitives/button'

import { RATE_LIMIT_RETRY_SECONDS } from '../../ChatThread.constants'
import { useCountdown } from '../../ChatThread.hooks'
import { getFailureKind } from '../../ChatThread.utils'

export interface FailureCardProps {
  orgSlug: string
  /** The answer's error code. */
  code: string | null
  modelName: string | null
  canManageVault: boolean
  hasLocalModel: boolean
  /** Only the latest failed answer can be sent again. */
  isRetryable: boolean
  onRetry: () => void
  onUseLocalModel: () => void
}

/**
 * The inline card for an answer that failed (chat.md §4): what happened, that the message is saved,
 * and what to do next. A rate limit counts down and retries by itself.
 */
export default function FailureCard({
  orgSlug,
  code,
  modelName,
  canManageVault,
  hasLocalModel,
  isRetryable,
  onRetry,
  onUseLocalModel,
}: Readonly<FailureCardProps>) {
  const t = useTranslations('chat.thread.failure')
  const kind = getFailureKind(code)
  const seconds = useCountdown(
    kind === 'rate-limit' && isRetryable,
    RATE_LIMIT_RETRY_SECONDS,
    onRetry,
  )

  const retry = isRetryable && (
    <Button variant="secondary" size="sm" onClick={onRetry}>
      {kind === 'rate-limit' ? t('retryNow') : t('retry')}
    </Button>
  )

  if (kind === 'budget' || kind === 'credits') {
    return (
      <Banner
        tone="warning"
        title={t(`${kind}.title`)}
        description={t(`${kind}.description`)}
        isAnnounced
        action={
          <div className="flex flex-wrap gap-2">
            {hasLocalModel && (
              <Button variant="secondary" size="sm" onClick={onUseLocalModel}>
                {t('useLocal')}
              </Button>
            )}
            {canManageVault && (
              <Button variant="link" size="sm" asChild>
                <Link href={toRoute(ROUTES.workspace.settings(orgSlug, 'usage'))}>
                  {t('openUsage')}
                </Link>
              </Button>
            )}
          </div>
        }
      />
    )
  }
  if (kind === 'rate-limit') {
    return (
      <Banner
        tone="warning"
        title={t('rateLimit.title')}
        description={isRetryable ? t('rateLimit.countdown', { seconds }) : t('rateLimit.waiting')}
        isAnnounced
        action={retry || undefined}
      />
    )
  }
  if (kind === 'not-allowed') {
    return (
      <Banner
        tone="warning"
        title={t('notAllowed.title', { model: modelName ?? t('notAllowed.fallbackModel') })}
        description={t('notAllowed.description')}
        isAnnounced
      />
    )
  }
  return (
    <Banner
      tone="destructive"
      title={kind === 'unavailable' ? t('unavailable.title') : t('generic.title')}
      description={kind === 'unavailable' ? t('unavailable.description') : t('generic.description')}
      isAnnounced
      action={
        <div className="flex flex-wrap gap-2">
          {retry}
          {canManageVault && kind === 'unavailable' && (
            <Button variant="link" size="sm" asChild>
              <Link href={toRoute(ROUTES.workspace.vault(orgSlug))}>{t('openVault')}</Link>
            </Button>
          )}
        </div>
      }
    />
  )
}
