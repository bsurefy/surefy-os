// SPDX-License-Identifier: AGPL-3.0-only
import type { InvitationPreviewDto } from '@surefy/contracts'

export interface AcceptInvitationProps {
  /** The token of the link in the email. */
  token: string
  /** What the link is for, read on the server; null when it matches no invitation. */
  invitation: InvitationPreviewDto | null
  /** The signed-in account, read on the server; null when nobody is signed in. */
  signedInAs: { email: string; isTwoFactorEnabled: boolean } | null
}
