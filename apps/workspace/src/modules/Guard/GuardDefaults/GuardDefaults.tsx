// SPDX-License-Identifier: AGPL-3.0-only
import { SlidersHorizontal } from 'lucide-react'
import { useTranslations } from 'next-intl'

import { EmptyState } from '@surefy/ui/components/DataDisplay'
import { PageHeader } from '@surefy/ui/components/Layout'

/**
 * Defaults. Module skeleton stub: the page header and empty state until the screen is built.
 */
export default function GuardDefaults() {
  const t = useTranslations('guard.defaults')
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t('title')} description={t('description')} />
      <EmptyState
        icon={SlidersHorizontal}
        title={t('empty.title')}
        description={t('empty.description')}
      />
    </div>
  )
}
