// SPDX-License-Identifier: AGPL-3.0-only
'use client'

import Link from 'next/link'

import { ROUTES } from '@/constants/routes'
import { toRoute } from '@/modules/Workspace'
import { ErrorState, SkeletonForm } from '@surefy/ui/components/Feedback'
import { PageHeader, Section } from '@surefy/ui/components/Layout'
import { FeatureGate, UpgradeCard } from '@surefy/web-core/access'

import SecurityForm from './SecurityForm'
import { GATED_SECURITY_FEATURES } from './SecuritySettings.constants'
import { useSecuritySettingsController } from './SecuritySettings.controller'

/** Settings › Security: two-factor requirement, session length, and the Enterprise sign-in features. */
export default function SecuritySettings() {
  const c = useSecuritySettingsController()
  const { t } = c

  let form
  if (c.isLoading) form = <SkeletonForm fields={3} />
  else if (c.errorMessage || !c.organization) {
    form = (
      <ErrorState
        title={t('loadError')}
        message={c.errorMessage ?? t('loadError')}
        reference={c.errorReference}
        onRetry={c.refetch}
        size="sm"
      />
    )
  } else form = <SecurityForm organization={c.organization} />

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t('title')} description={t('description')} />
      <section aria-busy={c.isLoading || undefined}>{form}</section>
      {GATED_SECURITY_FEATURES.map(({ feature, id }) => (
        <FeatureGate key={feature} feature={feature} fallback={<UpgradeCard feature={feature} />}>
          <Section title={t(`gated.${id}.title`)} description={t(`gated.${id}.available`)} />
        </FeatureGate>
      ))}
      <Section title={t('supportAccess.title')} description={t('supportAccess.description')}>
        <Link
          href={toRoute(ROUTES.workspace.guard(c.orgSlug, 'support-access'))}
          className="text-primary text-body underline-offset-4 hover:underline"
        >
          {t('supportAccess.link')}
        </Link>
      </Section>
    </div>
  )
}
