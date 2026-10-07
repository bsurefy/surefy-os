// SPDX-License-Identifier: AGPL-3.0-only
'use client'

import { useTranslations } from 'next-intl'

import { FEATURES } from '@surefy/contracts'
import { PageHeader, Section } from '@surefy/ui/components/Layout'
import { FeatureGate, UpgradeCard } from '@surefy/web-core/access'

import CapabilityMatrix from './CapabilityMatrix'
import EffectiveAccess from './EffectiveAccess'

/** Settings › Roles & access: the capability matrix, effective access, and custom roles. */
export default function AccessSettings() {
  const t = useTranslations('settings.access')

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t('title')} description={t('description')} />
      <CapabilityMatrix />
      <EffectiveAccess />
      <FeatureGate
        feature={FEATURES.CUSTOM_ROLES}
        fallback={<UpgradeCard feature={FEATURES.CUSTOM_ROLES} />}
      >
        <Section title={t('customRoles.title')} description={t('customRoles.available')} />
      </FeatureGate>
    </div>
  )
}
