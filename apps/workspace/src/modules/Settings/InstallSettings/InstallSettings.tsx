// SPDX-License-Identifier: AGPL-3.0-only
'use client'

import { Banner, ErrorState, SkeletonCard } from '@surefy/ui/components/Feedback'
import { PageHeader, Section } from '@surefy/ui/components/Layout'

import AdminsSection from './AdminsSection'
import InstallForm from './InstallForm'
import { useInstallSettingsController } from './InstallSettings.controller'
import OrganizationsSection from './OrganizationsSection'
import SmtpSection from './SmtpSection'

/** Settings › Install (install administrators of a self-hosted install). */
export default function InstallSettings() {
  const c = useInstallSettingsController()
  const { t, settings } = c

  let body
  if (c.isLoading) body = <SkeletonCard lines={6} />
  else if (c.errorMessage || !settings) {
    body = (
      <ErrorState
        title={t('loadError')}
        message={c.errorMessage ?? t('loadError')}
        reference={c.errorReference}
        onRetry={c.refetch}
      />
    )
  } else {
    body = (
      <>
        <Section title={t('version.title')}>
          <p className="text-body">{t('version.current', { version: settings.version.current })}</p>
          {c.hasUpdate && settings.version.latest && (
            <Banner
              tone="info"
              title={t('version.updateTitle', { version: settings.version.latest })}
              description={t('version.updateDescription')}
            />
          )}
        </Section>
        <OrganizationsSection settings={settings} limitState={c.limitState} />
        <InstallForm settings={settings} />
        <SmtpSection settings={settings} />
        <AdminsSection />
      </>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t('title')} description={t('description')} />
      <div aria-busy={c.isLoading || undefined} className="flex flex-col gap-6">
        {body}
      </div>
    </div>
  )
}
