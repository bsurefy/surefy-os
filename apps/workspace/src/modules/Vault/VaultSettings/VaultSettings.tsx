// SPDX-License-Identifier: AGPL-3.0-only
import { KeyRound } from 'lucide-react'
import { useTranslations } from 'next-intl'

import { EmptyState } from '@surefy/ui/components/DataDisplay'
import { PageHeader } from '@surefy/ui/components/Layout'

/**
 * Settings › Vault: providers and keys, local models, model access and fallback. Module skeleton
 * stub: the page header and empty state until the screen is built.
 */
export default function VaultSettings() {
  const t = useTranslations('vault.page')
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t('title')} description={t('description')} />
      <EmptyState icon={KeyRound} title={t('empty.title')} description={t('empty.description')} />
    </div>
  )
}
