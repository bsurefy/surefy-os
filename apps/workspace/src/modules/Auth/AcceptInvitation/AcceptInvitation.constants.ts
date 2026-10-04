// SPDX-License-Identifier: AGPL-3.0-only
export const INVITATION_ERROR_STATE = {
  NOT_FOUND: 'notFound',
  EXPIRED: 'expired',
  REVOKED: 'revoked',
  ACCEPTED: 'accepted',
} as const
export type InvitationErrorState =
  (typeof INVITATION_ERROR_STATE)[keyof typeof INVITATION_ERROR_STATE]
