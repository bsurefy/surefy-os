// SPDX-License-Identifier: AGPL-3.0-only
import { UserPlus } from 'lucide-react'
import { useTranslations } from 'next-intl'

import { EmptyState } from '@surefy/ui/components/DataDisplay'
import { PageHeader } from '@surefy/ui/components/Layout'

/**
 * Settings › Members. Module skeleton stub: the page header and empty state until the screen is
 * built.
 */
export default function MembersSettings() {
  const t = useTranslations('settings')
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t('sections.members')} description={t('members.description')} />
      <EmptyState
        icon={UserPlus}
        title={t('members.empty.title')}
        description={t('members.empty.description')}
      />
    </div>
  )
}
