// SPDX-License-Identifier: AGPL-3.0-only
import type { InvitationPreviewDto } from '@surefy/contracts'

import { INVITATION_ERROR_STATE } from './AcceptInvitation.constants'

import type { InvitationErrorState } from './AcceptInvitation.constants'

/** Why the link cannot be used, or null for a pending invitation. */
export function getInvitationErrorState(
  invitation: InvitationPreviewDto | null,
): InvitationErrorState | null {
  if (invitation === null) return INVITATION_ERROR_STATE.NOT_FOUND
  switch (invitation.status) {
    case 'expired':
      return INVITATION_ERROR_STATE.EXPIRED
    case 'revoked':
      return INVITATION_ERROR_STATE.REVOKED
    case 'accepted':
      return INVITATION_ERROR_STATE.ACCEPTED
    default:
      return null
  }
}

/** Emails are stored lowercase; compare them that way. */
export function isSameEmail(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase()
}
