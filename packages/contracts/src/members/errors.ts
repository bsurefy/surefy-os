// SPDX-License-Identifier: AGPL-3.0-only
/** Error codes of the members domain (UPPER_SNAKE_CASE, <DOMAIN>_<PROBLEM>; never renamed or reused). */
export const MEMBERS_ERROR_CODES = {
  MEMBER_NOT_FOUND: 'MEMBER_NOT_FOUND',
  MEMBERS_LAST_OWNER: 'MEMBERS_LAST_OWNER', // 409: the change would leave no active Owner
  MEMBERS_OWNER_ROLE_RESTRICTED: 'MEMBERS_OWNER_ROLE_RESTRICTED', // 403: only Owners add, change or remove Owners
  MEMBERS_PRIMARY_TEAM_NOT_A_MEMBER: 'MEMBERS_PRIMARY_TEAM_NOT_A_MEMBER', // 422: primary team must be one of the member's teams
  MEMBERS_ALREADY_MEMBER: 'MEMBERS_ALREADY_MEMBER', // 409: the address already belongs to a member
  MEMBERS_ALREADY_INVITED: 'MEMBERS_ALREADY_INVITED', // 409: a pending invitation exists; resend instead
  MEMBERS_TRANSFER_REQUIRED: 'MEMBERS_TRANSFER_REQUIRED', // 422: the member owns agents or flows; name who takes them
  MEMBERS_TRANSFER_TARGET_INVALID: 'MEMBERS_TRANSFER_TARGET_INVALID', // 422: not an active member able to own them
  INVITATION_NOT_FOUND: 'INVITATION_NOT_FOUND',
  INVITATION_EXPIRED: 'INVITATION_EXPIRED', // 409: ask the inviter for a new one
  INVITATION_REVOKED: 'INVITATION_REVOKED', // 409
  INVITATION_ALREADY_ACCEPTED: 'INVITATION_ALREADY_ACCEPTED', // 409
  INVITATION_EMAIL_MISMATCH: 'INVITATION_EMAIL_MISMATCH', // 403: signed in with another account
} as const
