// SPDX-License-Identifier: AGPL-3.0-only
'use client'

import { useSignOut } from '@/core/auth/useSignOut'
import { SessionExpiredDialog } from '@surefy/web-core/auth'

// The Auth module's sign-in form goes here once it exists; until then the dialog offers sign-out.
const renderSignIn = () => null

/** The session-expired dialog, mounted once: `openSessionExpired` opens it on a 401 during work. */
export function SessionExpiry() {
  const signOut = useSignOut()

  return (
    <SessionExpiredDialog
      renderSignIn={renderSignIn}
      onSignOut={() => {
        void signOut()
      }}
    />
  )
}
