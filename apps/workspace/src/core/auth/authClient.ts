// SPDX-License-Identifier: AGPL-3.0-only
import { twoFactorClient } from 'better-auth/client/plugins'
import { createAuthClient } from 'better-auth/react'

import { ROUTES } from '@/constants/routes'

/**
 * The workspace's Better Auth client: sign in, sign up, sign out, email verification, password
 * reset and two-factor. No `baseURL`: requests go to `/api/auth` on the current host, so they use
 * this app's host-only cookie. A plugin is added here only when its server plugin is enabled.
 */
export const authClient = createAuthClient({
  plugins: [
    twoFactorClient({
      onTwoFactorRedirect: () => {
        window.location.assign(ROUTES.auth.twoFactor)
      },
    }),
  ],
})
