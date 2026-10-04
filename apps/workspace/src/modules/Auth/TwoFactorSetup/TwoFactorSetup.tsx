// SPDX-License-Identifier: AGPL-3.0-only
import { useTranslations } from 'next-intl'

import { PageHeader } from '@surefy/ui/components/Layout'

/** Two-factor setup. Module skeleton stub: the page header until the screen is built. */
export default function TwoFactorSetup() {
  const t = useTranslations('auth.twoFactorSetup')
  return (
    <div className="mx-auto flex w-full max-w-sm flex-col gap-6 px-4 py-16">
      <PageHeader title={t('title')} description={t('description')} />
    </div>
  )
}
