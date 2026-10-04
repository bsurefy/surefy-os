// SPDX-License-Identifier: AGPL-3.0-only
import { getTranslations } from 'next-intl/server'

import { ROUTES } from '@/constants/routes'
import { TwoFactorSetup } from '@/modules/Auth'
import { requireSession } from '@surefy/web-core/auth/server'

import type { Metadata } from 'next'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('auth.twoFactorSetup')
  return { title: t('title') }
}

// `/two-factor` is a public prefix for the session proxy, so the setup page asks for the session itself
export default async function TwoFactorSetupPage({
  searchParams,
}: Readonly<{ searchParams: Promise<{ redirect?: string | string[] }> }>) {
  await requireSession(ROUTES.auth.login)
  const { redirect } = await searchParams
  return <TwoFactorSetup redirect={typeof redirect === 'string' ? redirect : undefined} />
}
