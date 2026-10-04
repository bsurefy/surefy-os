// SPDX-License-Identifier: AGPL-3.0-only
'use client'

import Link from 'next/link'
import { useTranslations } from 'next-intl'

import { ROUTES } from '@/constants/routes'
import { StatusPill } from '@surefy/ui/components/DataDisplay'
import { Section } from '@surefy/ui/components/Layout'
import { Button } from '@surefy/ui/primitives/button'

import { toRoute } from '../../Workspace.utils'

/** Two-step verification status; setting it up happens on the sign-in screens. */
export default function ProfileSecurity({ isTwoFactorOn }: Readonly<{ isTwoFactorOn: boolean }>) {
  const t = useTranslations('workspace.profile.security')

  return (
    <Section title={t('title')}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col gap-1">
          <span className="text-body flex items-center gap-2 font-medium">
            {t('twoFactor')}
            <StatusPill
              tone={isTwoFactorOn ? 'success' : 'neutral'}
              label={isTwoFactorOn ? t('on') : t('off')}
            />
          </span>
          <span className="text-caption text-muted-foreground">
            {isTwoFactorOn ? t('onDescription') : t('offDescription')}
          </span>
        </div>
        {!isTwoFactorOn && (
          <Button asChild variant="secondary">
            <Link href={toRoute(ROUTES.auth.twoFactorSetup)}>{t('setUp')}</Link>
          </Button>
        )}
      </div>
    </Section>
  )
}
