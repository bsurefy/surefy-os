// SPDX-License-Identifier: AGPL-3.0-only
import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'

import { setupApi } from '@/api/setup'
import { ROUTES } from '@/constants/routes'
import { SignIn } from '@/modules/Auth'
import { toRoute } from '@/modules/Workspace'
import { getServerHttpClient } from '@surefy/web-core/http/server'

import type { Metadata } from 'next'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('auth.signIn')
  return { title: t('title') }
}

/** Whether the install still has no organization; sign-in shows as usual when the API is down. */
async function isSetupOpen(): Promise<boolean> {
  try {
    return !(await setupApi.status(await getServerHttpClient())).isComplete
  } catch {
    return false
  }
}

/**
 * Sign-in. A fresh self-hosted install has no account to sign in with yet, so the first visit
 * goes to first-run setup instead.
 */
export default async function LoginPage({
  searchParams,
}: Readonly<{ searchParams: Promise<{ redirect?: string | string[] }> }>) {
  if (await isSetupOpen()) redirect(toRoute(ROUTES.auth.setup))
  const { redirect: next } = await searchParams
  return <SignIn redirect={typeof next === 'string' ? next : undefined} />
}
