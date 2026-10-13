// SPDX-License-Identifier: AGPL-3.0-only
import type { ConnectionDto } from '@surefy/contracts'

export interface AddConnectionDialogProps {
  orgId: string
  /** Admins and Owners may add team and organization connections. */
  canManage: boolean
  /** The app's display name from its key. */
  providerName: (providerKey: string) => string
  /**
   * Opened from a tool, channel or source that needs a connection: starts at the sign-in step with
   * the app chosen.
   */
  initialProviderKey?: string
  /** Where the browser returns to after an OAuth sign-in; Settings › Connections when omitted. */
  returnTo?: string
  /** Called with the new connection once it is saved (keys; an OAuth sign-in returns later). */
  onConnected?: (connection: ConnectionDto) => void
  onClose: () => void
}
