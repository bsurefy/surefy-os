// SPDX-License-Identifier: AGPL-3.0-only
import { FileText } from 'lucide-react'
import { useTranslations } from 'next-intl'

import { EmptyState } from '@surefy/ui/components/DataDisplay'
import { PageHeader } from '@surefy/ui/components/Layout'

/**
 * One knowledge base and its tabs. Module skeleton stub: the page header and empty state until the
 * screen is built.
 */
export default function KnowledgeBaseDetail() {
  const t = useTranslations('knowledge.detail')
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t('title')} level="object" />
      <EmptyState icon={FileText} title={t('empty.title')} description={t('empty.description')} />
    </div>
  )
}
