// SPDX-License-Identifier: AGPL-3.0-only
import { useQueryClient } from '@tanstack/react-query'

import { ROUTES } from '@/constants/routes'

import { authClient } from './authClient'

/**
 * Signs out of the workspace only: ends the Better Auth session, clears the query cache, then
 * replaces the page with the login page. The full page load also resets every client store.
 */
export function useSignOut(): () => Promise<void> {
  const queryClient = useQueryClient()

  return async () => {
    await authClient.signOut()
    queryClient.clear()
    window.location.replace(ROUTES.auth.login)
  }
}
