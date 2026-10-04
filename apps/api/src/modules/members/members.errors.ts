// SPDX-License-Identifier: AGPL-3.0-only
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  UnprocessableError,
} from '@/core/errors/index.js'
import { ERROR_CODES } from '@surefy/contracts'

export class MemberNotFoundError extends NotFoundError {
  constructor() {
    super(ERROR_CODES.MEMBER_NOT_FOUND, 'Member not found')
  }
}

/** The change would leave the organization without an active Owner. */
export class LastOwnerError extends ConflictError {
  constructor() {
    super(ERROR_CODES.MEMBERS_LAST_OWNER, 'Make someone else an Owner first')
  }
}

/** Only Owners add, change or remove Owners (`members:manage-admins`). */
export class OwnerRoleRestrictedError extends ForbiddenError {
  constructor() {
    super(ERROR_CODES.MEMBERS_OWNER_ROLE_RESTRICTED, 'Only Owners can change Owners')
  }
}

export class PrimaryTeamOutsideTeamsError extends UnprocessableError {
  constructor() {
    super(
      ERROR_CODES.MEMBERS_PRIMARY_TEAM_NOT_A_MEMBER,
      'The primary team must be one of the member’s teams',
    )
  }
}

export class TransferTargetInvalidError extends UnprocessableError {
  constructor() {
    super(
      ERROR_CODES.MEMBERS_TRANSFER_TARGET_INVALID,
      'Choose an active member to take over their agents and flows',
    )
  }
}

export class AlreadyMemberError extends ConflictError {
  constructor() {
    super(ERROR_CODES.MEMBERS_ALREADY_MEMBER, 'This person is already a member')
  }
}

export class AlreadyInvitedError extends ConflictError {
  constructor() {
    super(ERROR_CODES.MEMBERS_ALREADY_INVITED, 'This address already has a pending invitation')
  }
}

/** Per-organization preferences belong to a person: API keys have none. */
export class MemberPersonRequiredError extends ForbiddenError {
  constructor() {
    super(ERROR_CODES.ACCESS_FORBIDDEN, 'Available to signed-in members only')
  }
}

export class InvitationNotFoundError extends NotFoundError {
  constructor() {
    super(ERROR_CODES.INVITATION_NOT_FOUND, 'Invitation not found')
  }
}

export class InvitationExpiredError extends ConflictError {
  constructor() {
    super(ERROR_CODES.INVITATION_EXPIRED, 'This invitation has expired')
  }
}

export class InvitationRevokedError extends ConflictError {
  constructor() {
    super(ERROR_CODES.INVITATION_REVOKED, 'This invitation was revoked')
  }
}

export class InvitationAlreadyAcceptedError extends ConflictError {
  constructor() {
    super(ERROR_CODES.INVITATION_ALREADY_ACCEPTED, 'This invitation was already accepted')
  }
}

/** Signed in with another account than the invited address. */
export class InvitationEmailMismatchError extends ForbiddenError {
  constructor() {
    super(ERROR_CODES.INVITATION_EMAIL_MISMATCH, 'This invitation is for another email address')
  }
}
