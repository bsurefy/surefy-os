// SPDX-License-Identifier: AGPL-3.0-only
import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'

import { ROUTES } from '@/constants/routes'
import { getPostSignInPath, NoOrganization } from '@/modules/Auth'
import { toRoute } from '@/modules/Workspace'
import { requireSession } from '@surefy/web-core/auth/server'

import type { Metadata } from 'next'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('auth.noOrganization')
  return { title: t('title') }
}

export default async function NoOrganizationPage() {
  const session = await requireSession(ROUTES.auth.login)
  if (session.memberships.length > 0) redirect(toRoute(getPostSignInPath(session)))
  return <NoOrganization />
}
