// SPDX-License-Identifier: AGPL-3.0-only
import { AppError, ConflictError, ForbiddenError, NotFoundError } from '@/core/errors/index.js'
import { ERROR_CODES } from '@surefy/contracts'

/** Install routes are for install administrators only (no organization permission applies). */
export class InstallAdminRequiredError extends ForbiddenError {
  constructor() {
    super(ERROR_CODES.INSTALL_ADMIN_REQUIRED, 'Install administrators only')
  }
}

export class InstallAdminExistsError extends ConflictError {
  constructor() {
    super(ERROR_CODES.INSTALL_ADMIN_EXISTS, 'Already an install administrator')
  }
}

/** At least one install administrator must remain. */
export class InstallLastAdminError extends ConflictError {
  constructor() {
    super(ERROR_CODES.INSTALL_LAST_ADMIN, 'Name another install administrator first')
  }
}

export class InstallAdminNotFoundError extends NotFoundError {
  constructor() {
    super(ERROR_CODES.NOT_FOUND, 'Install administrator not found')
  }
}

/** The person to make an administrator has no account. */
export class InstallUserNotFoundError extends NotFoundError {
  constructor() {
    super(ERROR_CODES.NOT_FOUND, 'User not found')
  }
}

export class InstallSmtpNotConfiguredError extends ConflictError {
  constructor() {
    super(ERROR_CODES.INSTALL_SMTP_NOT_CONFIGURED, 'Email server settings are missing')
  }
}

/** The mail server refused or could not be reached: 502, the upstream failed, not the request. */
export class InstallSmtpTestFailedError extends AppError {
  constructor(options: { cause: unknown }) {
    super(ERROR_CODES.INSTALL_SMTP_TEST_FAILED, 502, 'The mail server did not accept the message', {
      cause: options.cause,
    })
  }
}
