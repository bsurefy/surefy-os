// SPDX-License-Identifier: AGPL-3.0-only
import { getTranslations } from 'next-intl/server'

import { ResetPassword } from '@/modules/Auth'

import type { Metadata } from 'next'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('auth.resetPassword')
  return { title: t('title') }
}

export default async function ResetPasswordPage({
  searchParams,
}: Readonly<{ searchParams: Promise<{ token?: string | string[]; error?: string | string[] }> }>) {
  const { token, error } = await searchParams
  return (
    <ResetPassword
      token={typeof token === 'string' ? token : undefined}
      hasLinkError={error !== undefined}
    />
  )
}
