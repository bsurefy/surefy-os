// SPDX-License-Identifier: AGPL-3.0-only
import 'server-only'
import { redirect } from 'next/navigation'
import { cache } from 'react'

import { ERROR_CODES, type MeDto } from '@surefy/contracts'

import { meApi } from '../api/me/me.api'
import { isApiError } from '../errors/isApiError'
import { getServerHttpClient } from '../http/server'

/**
 * `GET /api/v1/me` for the current request: user, memberships, platform and partner roles, active
 * support grants. Null when there is no valid session; any other failure throws, so a broken API
 * shows the error boundary instead of the login page. Deduplicated within one server render.
 */
export const getSession = cache(async (): Promise<MeDto | null> => {
  try {
    return await meApi.get(await getServerHttpClient())
  } catch (error) {
    if (isApiError(error) && error.code === ERROR_CODES.AUTH_UNAUTHENTICATED) return null
    throw error
  }
})

/** The session, or a redirect to the app's login page. Each app builds its own guards on it. */
export async function requireSession(loginPath: string): Promise<MeDto> {
  const session = await getSession()
  // The assertion matters only under the app's `typedRoutes`, where web-core cannot know the path
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion -- see above
  if (!session) redirect(loginPath as Parameters<typeof redirect>[0])
  return session
}
