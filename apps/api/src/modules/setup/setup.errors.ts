// SPDX-License-Identifier: AGPL-3.0-only
import { ConflictError, ForbiddenError, UnprocessableError } from '@/core/errors/index.js'
import { ERROR_CODES } from '@surefy/contracts'

/** An organization exists (or setup was finished): `POST /setup` is closed for good. */
export class SetupAlreadyCompletedError extends ConflictError {
  constructor() {
    super(ERROR_CODES.SETUP_ALREADY_COMPLETED, 'Setup is already complete')
  }
}

/** `SETUP_TOKEN` is set and the request carries no token or another one. */
export class SetupTokenInvalidError extends ForbiddenError {
  constructor() {
    super(ERROR_CODES.SETUP_TOKEN_INVALID, 'The setup token is missing or wrong')
  }
}

/** Not an IANA time zone the runtime knows. */
export class SetupInvalidTimezoneError extends UnprocessableError {
  constructor() {
    super(ERROR_CODES.VALIDATION_FAILED, 'Unknown time zone', {
      details: [
        { path: 'organization.timezone', code: 'invalid_value', message: 'Unknown time zone' },
      ],
    })
  }
}

/** An account with the Owner's address exists already (left over from an earlier attempt). */
export class SetupOwnerEmailTakenError extends UnprocessableError {
  constructor() {
    super(ERROR_CODES.VALIDATION_FAILED, 'An account with this email exists', {
      details: [
        { path: 'owner.email', code: 'taken', message: 'An account with this email exists' },
      ],
    })
  }
}
