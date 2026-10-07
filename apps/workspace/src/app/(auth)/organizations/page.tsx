// SPDX-License-Identifier: AGPL-3.0-only
import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'

import { ROUTES } from '@/constants/routes'
import { ChooseOrganization, getPostSignInPath } from '@/modules/Auth'
import { toRoute } from '@/modules/Workspace'
import { requireSession } from '@surefy/web-core/auth/server'

import type { Metadata } from 'next'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('auth.chooseOrganization')
  return { title: t('title') }
}

export default async function OrganizationsPage() {
  const session = await requireSession(ROUTES.auth.login)
  // The picker is for several organizations and no last-used one; everyone else is sent on
  const path = getPostSignInPath(session)
  if (path !== ROUTES.auth.organizations) redirect(toRoute(path))
  return <ChooseOrganization memberships={session.memberships} />
}
