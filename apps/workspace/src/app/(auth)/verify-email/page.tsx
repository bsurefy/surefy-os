// SPDX-License-Identifier: AGPL-3.0-only
import { getTranslations } from 'next-intl/server'

import { VerifyEmail } from '@/modules/Auth'

import type { Metadata } from 'next'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('auth.verifyEmail')
  return { title: t('title') }
}

export default async function VerifyEmailPage({
  searchParams,
}: Readonly<{ searchParams: Promise<{ error?: string | string[] }> }>) {
  const { error } = await searchParams
  return <VerifyEmail hasLinkError={error !== undefined} />
}
