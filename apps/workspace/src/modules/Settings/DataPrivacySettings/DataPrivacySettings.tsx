// SPDX-License-Identifier: AGPL-3.0-only
'use client'

import { useTranslations } from 'next-intl'

import { PERMISSIONS } from '@surefy/contracts'
import { PageHeader } from '@surefy/ui/components/Layout'
import { useCan } from '@surefy/web-core/access'

import DeleteOrganizationSection from './DeleteOrganizationSection'
import ExportSection from './ExportSection'
import PrivacySection from './PrivacySection'
import RetentionSection from './RetentionSection'

/** Settings › Data & privacy: storage and retention, chat sharing, export, and deletion. */
export default function DataPrivacySettings() {
  const t = useTranslations('settings.dataPrivacy')
  const canChangeSettings = useCan(PERMISSIONS.SETTINGS_MANAGE)
  const canExport = useCan(PERMISSIONS.DATA_CONTROL_EXPORT)
  const canDelete = useCan(PERMISSIONS.DATA_CONTROL_DELETE)

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t('title')} description={t('description')} />
      <RetentionSection />
      <PrivacySection canChange={canChangeSettings} />
      <ExportSection canExport={canExport} />
      {canDelete && <DeleteOrganizationSection />}
    </div>
  )
}
