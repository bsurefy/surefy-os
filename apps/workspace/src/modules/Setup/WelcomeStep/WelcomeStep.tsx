// SPDX-License-Identifier: AGPL-3.0-only
'use client'

import { CircleAlert, CircleCheck, TriangleAlert } from 'lucide-react'
import { useTranslations } from 'next-intl'

import type { SetupCheckDto } from '@surefy/contracts'
import { Banner } from '@surefy/ui/components/Feedback'
import { Button } from '@surefy/ui/primitives/button'

import { hasBlockingFailure } from '../Setup.utils'

export interface WelcomeStepProps {
  checks: readonly SetupCheckDto[]
  isChecking: boolean
  onCheckAgain: () => void
  onContinue: () => void
}

const FIX_CODES = [
  'DATABASE_UNREACHABLE',
  'STORAGE_UNAVAILABLE',
  'EMAIL_NOT_CONFIGURED',
  'GPU_NOT_DETECTED',
] as const

function getTone(check: SetupCheckDto) {
  if (check.status === 'ok') return { Icon: CircleCheck, className: 'text-success' }
  if (check.status === 'failed' && check.blocking) {
    return { Icon: CircleAlert, className: 'text-destructive' }
  }
  return { Icon: TriangleAlert, className: 'text-warning' }
}

/**
 * Welcome: the server check. A failed database stops setup with the fix and "Check again"; the
 * optional checks (storage, email, GPU) warn and let setup continue.
 */
export default function WelcomeStep({
  checks,
  isChecking,
  onCheckAgain,
  onContinue,
}: Readonly<WelcomeStepProps>) {
  const t = useTranslations('setup.welcome')
  const tWizard = useTranslations('setup.wizard')
  const isBlocked = hasBlockingFailure(checks)

  const fixFor = (check: SetupCheckDto): string | null => {
    if (check.status === 'ok') return null
    const code = FIX_CODES.find((candidate) => candidate === check.code)
    return t(`fixes.${code ?? 'unknown'}`)
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1.5">
        <h1 className="text-page-title">{t('title')}</h1>
        <p className="text-body text-muted-foreground">{t('description')}</p>
      </div>
      <ul aria-label={t('checksLabel')} className="flex flex-col gap-3">
        {checks.map((check) => {
          const fix = fixFor(check)
          const tone = getTone(check)
          return (
            <li key={check.key} className="flex items-start gap-3">
              <tone.Icon aria-hidden="true" className={`${tone.className} mt-0.5 size-4`} />
              <div className="flex min-w-0 flex-col gap-0.5">
                <p className="text-body flex flex-wrap items-baseline gap-x-2">
                  <span className="font-medium">{t(`checks.${check.key}`)}</span>
                  <span className="text-caption text-muted-foreground">
                    {check.status === 'failed' && !check.blocking
                      ? t('status.warning')
                      : t(`status.${check.status}`)}
                  </span>
                </p>
                {fix && <p className="text-caption text-muted-foreground">{fix}</p>}
              </div>
            </li>
          )
        })}
      </ul>
      {isBlocked && <Banner tone="destructive" title={t('blocked')} isAnnounced />}
      <div className="flex items-center justify-between gap-3">
        <p className="text-caption text-muted-foreground">{t('help')}</p>
        <div className="flex items-center gap-2">
          {isBlocked && (
            <Button variant="secondary" isLoading={isChecking} onClick={onCheckAgain}>
              {t('checkAgain')}
            </Button>
          )}
          <Button disabled={isBlocked} onClick={onContinue}>
            {tWizard('continue')}
          </Button>
        </div>
      </div>
    </div>
  )
}
