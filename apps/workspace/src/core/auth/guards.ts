// SPDX-License-Identifier: AGPL-3.0-only
// Server guards of the workspace (authentication.md §3). Server-only through
// `@surefy/web-core/auth/server`; `cache()` deduplicates them within one server render.
import { notFound } from 'next/navigation'
import { cache } from 'react'

import { ROUTES } from '@/constants/routes'
import type { Feature, Permission } from '@surefy/contracts'
import { hasFeature, hasPermission } from '@surefy/web-core/access'
import { accessApi } from '@surefy/web-core/api/access'
import { requireSession } from '@surefy/web-core/auth/server'
import { getServerHttpClient } from '@surefy/web-core/http/server'

/**
 * The organization of `[orgSlug]` among the person's memberships. Not a member: 404, as if the
 * organization did not exist, so the UI never confirms another tenant.
 */
export const getCurrentOrg = cache(async (orgSlug: string) => {
  const session = await requireSession(ROUTES.auth.login)
  const org = session.memberships.find(
    (membership) => membership.organization.slug === orgSlug,
  )?.organization
  if (!org) notFound()
  return org
})

/** `GET /api/v1/orgs/:orgId/access/me` for the current request. */
export const getEffectiveAccess = cache(async (orgId: string) =>
  accessApi.me(await getServerHttpClient(), orgId),
)

/** For pages: the caller renders `NoAccessState` when `isAllowed` is false. */
export async function checkPageAccess(orgSlug: string, permission: Permission) {
  const org = await getCurrentOrg(orgSlug)
  const access = await getEffectiveAccess(org.id)
  return { org, access, isAllowed: hasPermission(access, permission) }
}

/** For pages that render a screen or its upgrade card on the server, with no flash. */
export async function checkFeature(orgSlug: string, feature: Feature): Promise<boolean> {
  const org = await getCurrentOrg(orgSlug)
  return hasFeature(await getEffectiveAccess(org.id), feature)
}
