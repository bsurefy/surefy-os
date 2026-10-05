// SPDX-License-Identifier: AGPL-3.0-only
'use client'

import { useQuery } from '@tanstack/react-query'
import { useTranslations } from 'next-intl'

import { installQueries } from '@/api/install'
import { FEATURES } from '@surefy/contracts'
import type { InstallSettingsDto } from '@surefy/contracts'
import { Banner } from '@surefy/ui/components/Feedback'
import { Section } from '@surefy/ui/components/Layout'
import { useHasFeature } from '@surefy/web-core/access'

import type { OrganizationLimitState } from '../InstallSettings.utils'

/** The organizations on this install, counted against the limit the license or plan allows. */
export default function OrganizationsSection({
  settings,
  limitState,
}: Readonly<{ settings: InstallSettingsDto; limitState: OrganizationLimitState | null }>) {
  const t = useTranslations('settings.install.organizations')
  const hasMultiOrganization = useHasFeature(FEATURES.MULTI_ORGANIZATION)
  const { data } = useQuery(installQueries.organizations())
  const { count, max } = settings.organizations

  return (
    <Section
      title={t('title')}
      description={max === null ? t('countUnlimited', { count }) : t('count', { count, max })}
    >
      {limitState === 'overLimit' && max !== null && (
        <Banner
          tone="warning"
          title={t('overLimit', { count, max })}
          description={t('overLimitHelp')}
        />
      )}
      {limitState === 'atLimit' && !hasMultiOrganization && (
        <p className="text-body text-muted-foreground">{t('upgrade')}</p>
      )}
      <ul className="flex flex-col divide-y" aria-label={t('listLabel')}>
        {(data?.items ?? []).map((organization) => (
          <li key={organization.id} className="flex justify-between gap-4 py-2">
            <span className="text-body">{organization.name}</span>
            <span className="text-caption text-muted-foreground">
              {t('members', { count: organization.memberCount })}
            </span>
          </li>
        ))}
      </ul>
    </Section>
  )
}
