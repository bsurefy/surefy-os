// SPDX-License-Identifier: AGPL-3.0-only
import type { ReactNode } from 'react'

export interface SessionSignInSlotProps {
  /** Call after a successful sign-in: the dialog closes and the active queries refetch. */
  onSignedIn: () => void
}

export interface SessionExpiredDialogProps {
  /**
   * The app's sign-in form inside the dialog. Each app brings its own, because its sign-in methods
   * differ (password and two-factor in the workspace, SSO and a security key in the console).
   */
  renderSignIn: (props: SessionSignInSlotProps) => ReactNode
  /** The app's sign-out: `authClient.signOut()`, clear the query cache, go to the login page. */
  onSignOut: () => void
}
