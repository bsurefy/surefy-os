// SPDX-License-Identifier: AGPL-3.0-only
import { useTranslations } from 'next-intl'

import { PageHeader } from '@surefy/ui/components/Layout'

/** Settings › Security. Module skeleton stub: the page header until the screen is built. */
export default function SecuritySettings() {
  const t = useTranslations('settings')
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t('sections.security')} description={t('security.description')} />
    </div>
  )
}
