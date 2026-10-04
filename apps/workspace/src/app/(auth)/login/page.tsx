// SPDX-License-Identifier: AGPL-3.0-only
import { getTranslations } from 'next-intl/server'

import { SignIn } from '@/modules/Auth'

import type { Metadata } from 'next'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('auth.signIn')
  return { title: t('title') }
}

export default async function LoginPage({
  searchParams,
}: Readonly<{ searchParams: Promise<{ redirect?: string | string[] }> }>) {
  const { redirect } = await searchParams
  return <SignIn redirect={typeof redirect === 'string' ? redirect : undefined} />
}
