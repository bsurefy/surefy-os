// SPDX-License-Identifier: AGPL-3.0-only
import type { ReactNode } from 'react'

/** `expired`: the session ended. `confirm`: it is too old for a sensitive action (`AUTH_SESSION_NOT_FRESH`). */
export type SessionDialogMode = 'expired' | 'confirm'

export interface SessionSignInSlotProps {
  /** In `confirm` mode the form fixes the email of the current account, so only that account can confirm. */
  mode: SessionDialogMode
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
