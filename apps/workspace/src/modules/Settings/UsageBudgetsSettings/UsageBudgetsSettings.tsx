// SPDX-License-Identifier: AGPL-3.0-only
import { Wallet } from 'lucide-react'
import { useTranslations } from 'next-intl'

import { EmptyState } from '@surefy/ui/components/DataDisplay'
import { PageHeader } from '@surefy/ui/components/Layout'

/**
 * Usage & budgets. Module skeleton stub: the page header and empty state until the screen is built.
 */
export default function UsageBudgetsSettings() {
  const t = useTranslations('settings.usage')
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t('title')} description={t('description')} />
      <EmptyState icon={Wallet} title={t('empty.title')} description={t('empty.description')} />
    </div>
  )
}
