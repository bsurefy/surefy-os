// SPDX-License-Identifier: AGPL-3.0-only
import { getTranslations } from 'next-intl/server'

import { NoOrganization } from '@/modules/Auth'

import type { Metadata } from 'next'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('auth.noOrganization')
  return { title: t('title') }
}

export default function NoOrganizationPage() {
  return <NoOrganization />
}
