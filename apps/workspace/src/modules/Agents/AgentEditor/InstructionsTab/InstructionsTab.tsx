// SPDX-License-Identifier: AGPL-3.0-only
import { FileText } from 'lucide-react'
import { useTranslations } from 'next-intl'

import { EmptyState } from '@surefy/ui/components/DataDisplay'
import { PageHeader } from '@surefy/ui/components/Layout'

/**
 * Instructions. Module skeleton stub: the page header and empty state until the screen is built.
 */
export default function InstructionsTab() {
  const t = useTranslations('agents.editor.instructions')
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t('title')} description={t('description')} />
      <EmptyState icon={FileText} title={t('empty.title')} description={t('empty.description')} />
    </div>
  )
}
