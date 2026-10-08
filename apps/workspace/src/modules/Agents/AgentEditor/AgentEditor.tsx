// SPDX-License-Identifier: AGPL-3.0-only
import { Bot } from 'lucide-react'
import { useTranslations } from 'next-intl'

import { EmptyState } from '@surefy/ui/components/DataDisplay'
import { PageHeader } from '@surefy/ui/components/Layout'

/**
 * Agent. Module skeleton stub: the page header and empty state until the screen is built.
 */
export default function AgentEditor() {
  const t = useTranslations('agents.editor')
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t('title')} description={t('description')} />
      <EmptyState icon={Bot} title={t('empty.title')} description={t('empty.description')} />
    </div>
  )
}
