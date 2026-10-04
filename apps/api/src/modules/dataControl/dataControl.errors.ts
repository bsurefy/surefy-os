// SPDX-License-Identifier: AGPL-3.0-only
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  UnprocessableError,
} from '@/core/errors/index.js'
import { ERROR_CODES, type ExportKind } from '@surefy/contracts'

export class DataRequestNotFoundError extends NotFoundError {
  constructor() {
    super(ERROR_CODES.DATA_REQUEST_NOT_FOUND, 'Data request not found')
  }
}

export class DeletionPendingError extends ConflictError {
  constructor() {
    super(ERROR_CODES.DATA_REQUEST_DELETION_PENDING, 'A deletion is already scheduled')
  }
}

export class DataRequestNotCancelableError extends ConflictError {
  constructor() {
    super(ERROR_CODES.DATA_REQUEST_NOT_CANCELABLE, 'This request can no longer be canceled')
  }
}

export class DataRequestNotRetryableError extends ConflictError {
  constructor() {
    super(ERROR_CODES.DATA_REQUEST_NOT_RETRYABLE, 'Only a failed export can be tried again')
  }
}

export class DataRequestNotReadyError extends ConflictError {
  constructor() {
    super(ERROR_CODES.DATA_REQUEST_NOT_READY, 'The archive is not ready or has expired')
  }
}

export class ExportNotFoundError extends NotFoundError {
  constructor() {
    super(ERROR_CODES.EXPORT_NOT_FOUND, 'Export not found')
  }
}

export class ExportNotReadyError extends ConflictError {
  constructor() {
    super(ERROR_CODES.EXPORT_NOT_READY, 'The file is not ready or has expired')
  }
}

export class ExportNotRetryableError extends ConflictError {
  constructor() {
    super(ERROR_CODES.EXPORT_NOT_RETRYABLE, 'Only a failed or expired export can be prepared again')
  }
}

/** No module produces this kind of export yet (it arrives with its module). */
export class ExportKindUnavailableError extends UnprocessableError {
  constructor(kind: ExportKind) {
    super(ERROR_CODES.VALIDATION_FAILED, 'This export is not available', {
      details: [{ field: 'kind', value: kind }],
    })
  }
}

/** Owner actions on the request route need their own permission besides `data-control:read`. */
export class DataControlForbiddenError extends ForbiddenError {
  constructor(permission: string) {
    super(ERROR_CODES.ACCESS_FORBIDDEN, 'Access forbidden', { meta: { permission } })
  }
}

/** Sensitive actions need a sign-in within the last 10 minutes. */
export class SessionNotFreshError extends ForbiddenError {
  constructor() {
    super(ERROR_CODES.AUTH_SESSION_NOT_FRESH, 'Sign in again to continue')
  }
}

/** Deleting an organization needs two-factor authentication on the account. */
export class DeletionNeedsTwoFactorError extends ForbiddenError {
  constructor() {
    super(ERROR_CODES.AUTH_TWO_FACTOR_REQUIRED, 'Set up two-factor authentication first')
  }
}
