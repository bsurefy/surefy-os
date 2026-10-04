// SPDX-License-Identifier: AGPL-3.0-only
import { dehydrate, HydrationBoundary } from '@tanstack/react-query'

import { ROUTES } from '@/constants/routes'
import { getCurrentOrg, getEffectiveAccess, getWorkspaceUpgradeLinks } from '@/core/auth'
import { WorkspaceShell } from '@/modules/Workspace'
import { OrgScopeProvider, UpgradeLinksProvider } from '@surefy/web-core/access'
import { accessKeys } from '@surefy/web-core/api/access'
import { meKeys } from '@surefy/web-core/api/me'
import { requireSession } from '@surefy/web-core/auth/server'
import { getQueryClient } from '@surefy/web-core/query'

import type { Metadata } from 'next'

export const metadata: Metadata = { robots: { index: false } }

/**
 * Every organization page: resolves the organization (404 when the person is not a member),
 * seeds the session and effective access the shell's navigation needs, and scopes the gating
 * hooks and the upgrade card's links to this organization.
 */
export default async function OrganizationLayout({
  children,
  params,
}: Readonly<LayoutProps<'/[orgSlug]'>>) {
  const { orgSlug } = await params
  const session = await requireSession(ROUTES.auth.login)
  const org = await getCurrentOrg(orgSlug)
  const access = await getEffectiveAccess(org.id)

  const queryClient = getQueryClient()
  queryClient.setQueryData(meKeys.current(), session)
  queryClient.setQueryData(accessKeys.me(org.id), access)

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <OrgScopeProvider orgId={org.id}>
        <UpgradeLinksProvider links={getWorkspaceUpgradeLinks(session.install, orgSlug)}>
          <WorkspaceShell orgSlug={orgSlug}>{children}</WorkspaceShell>
        </UpgradeLinksProvider>
      </OrgScopeProvider>
    </HydrationBoundary>
  )
}
