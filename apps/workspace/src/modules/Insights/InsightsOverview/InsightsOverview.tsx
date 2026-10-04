// SPDX-License-Identifier: AGPL-3.0-only
import { ChartLine } from 'lucide-react'
import { useTranslations } from 'next-intl'

import { EmptyState } from '@surefy/ui/components/DataDisplay'
import { PageHeader } from '@surefy/ui/components/Layout'

/**
 * Insights › Overview: usage and cost. Module skeleton stub: the page header and empty state until
 * the screen is built.
 */
export default function InsightsOverview() {
  const t = useTranslations('insights.overview')
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t('title')} description={t('description')} />
      <EmptyState icon={ChartLine} title={t('empty.title')} description={t('empty.description')} />
    </div>
  )
}
