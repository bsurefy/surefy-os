// SPDX-License-Identifier: AGPL-3.0-only
import { getTranslations } from 'next-intl/server'

import { TwoFactor } from '@/modules/Auth'

import type { Metadata } from 'next'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('auth.twoFactor')
  return { title: t('title') }
}

export default function TwoFactorPage() {
  return <TwoFactor />
}
