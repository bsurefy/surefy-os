// SPDX-License-Identifier: AGPL-3.0-only
import { ForbiddenError, NotFoundError, UnprocessableError } from '@/core/errors/index.js'
import { ERROR_CODES, type AccessExceedsParentDetail } from '@surefy/contracts'

/** Member requests into a suspended organization are refused (organizations-and-members.md). */
export class OrganizationSuspendedError extends ForbiddenError {
  constructor() {
    super(ERROR_CODES.ORGANIZATION_SUSPENDED, 'This organization is suspended')
  }
}

/** The organization requires two-factor and the person has not set it up yet. */
export class TwoFactorRequiredError extends ForbiddenError {
  constructor() {
    super(
      ERROR_CODES.AUTH_TWO_FACTOR_REQUIRED,
      'This organization requires two-factor authentication',
    )
  }
}

/** A policy may not allow what its parent level does not have (the golden rule). */
export class AccessExceedsParentError extends UnprocessableError {
  constructor(details: AccessExceedsParentDetail[]) {
    super(ERROR_CODES.ACCESS_EXCEEDS_PARENT, 'This allows more than the level above', {
      details: details.map((detail) => ({ ...detail })),
    })
  }
}

/** Effective access of someone who is not an active member. */
export class AccessMemberNotFoundError extends NotFoundError {
  constructor() {
    super(ERROR_CODES.MEMBER_NOT_FOUND, 'Member not found')
  }
}
