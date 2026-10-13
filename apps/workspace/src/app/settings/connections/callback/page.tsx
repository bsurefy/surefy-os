// SPDX-License-Identifier: AGPL-3.0-only
import { redirect } from 'next/navigation'

import { ROUTES } from '@/constants/routes'
import { getLastUsedOrganizationSlug, getPostSignInPath } from '@/modules/Auth'
import { getOauthReturnPath } from '@/modules/Settings'
import { toRoute } from '@/modules/Workspace'
import { requireSession } from '@surefy/web-core/auth/server'

/**
 * The address registered at each app as its return address (`OAUTH_CALLBACK_PATH` in the API). It
 * is the same for every organization, so it sends the person on to the return page of their
 * last-used organization, with what the app added to the address.
 */
export default async function ConnectionsReturnPage({
  searchParams,
}: Readonly<PageProps<'/settings/connections/callback'>>) {
  const session = await requireSession(ROUTES.auth.login)
  const orgSlug = getLastUsedOrganizationSlug(session)
  if (orgSlug === null) redirect(toRoute(getPostSignInPath(session)))
  redirect(toRoute(getOauthReturnPath(orgSlug, await searchParams)))
}
