// SPDX-License-Identifier: AGPL-3.0-only
import { ERROR_CODES, type ErrorCode } from '@surefy/contracts'

import { AppError, type AppErrorOptions } from './AppError.js'

// One base class per status, same constructor shape. Domain errors extend these with their code.

export class BadRequestError extends AppError {
  constructor(
    code: ErrorCode = ERROR_CODES.BAD_REQUEST,
    message = 'Bad request',
    options?: AppErrorOptions,
  ) {
    super(code, 400, message, options)
  }
}

export class UnauthorizedError extends AppError {
  constructor(
    code: ErrorCode = ERROR_CODES.AUTH_UNAUTHENTICATED,
    message = 'Authentication required',
    options?: AppErrorOptions,
  ) {
    super(code, 401, message, options)
  }
}

/** Cloud credits for platform models. */
export class PaymentRequiredError extends AppError {
  constructor(
    code: ErrorCode = ERROR_CODES.CREDITS_EXHAUSTED,
    message = 'Credits exhausted',
    options?: AppErrorOptions,
  ) {
    super(code, 402, message, options)
  }
}

export class ForbiddenError extends AppError {
  constructor(
    code: ErrorCode = ERROR_CODES.ACCESS_FORBIDDEN,
    message = 'Access forbidden',
    options?: AppErrorOptions,
  ) {
    super(code, 403, message, options)
  }
}

export class NotFoundError extends AppError {
  constructor(
    code: ErrorCode = ERROR_CODES.NOT_FOUND,
    message = 'Resource not found',
    options?: AppErrorOptions,
  ) {
    super(code, 404, message, options)
  }
}

export class ConflictError extends AppError {
  constructor(code: ErrorCode, message = 'Conflict', options?: AppErrorOptions) {
    super(code, 409, message, options)
  }
}

export class PayloadTooLargeError extends AppError {
  constructor(
    code: ErrorCode = ERROR_CODES.PAYLOAD_TOO_LARGE,
    message = 'Payload too large',
    options?: AppErrorOptions,
  ) {
    super(code, 413, message, options)
  }
}

export class UnprocessableError extends AppError {
  constructor(
    code: ErrorCode = ERROR_CODES.VALIDATION_FAILED,
    message = 'Unprocessable request',
    options?: AppErrorOptions,
  ) {
    super(code, 422, message, options)
  }
}

export class TooManyRequestsError extends AppError {
  constructor(
    code: ErrorCode = ERROR_CODES.RATE_LIMITED,
    message = 'Too many requests',
    options?: AppErrorOptions,
  ) {
    super(code, 429, message, options)
  }
}

export class InternalError extends AppError {
  constructor(
    code: ErrorCode = ERROR_CODES.INTERNAL_ERROR,
    message = 'Something went wrong',
    options?: AppErrorOptions,
  ) {
    super(code, 500, message, options)
  }
}

export class ServiceUnavailableError extends AppError {
  constructor(
    code: ErrorCode = ERROR_CODES.SERVICE_UNAVAILABLE,
    message = 'Service unavailable',
    options?: AppErrorOptions,
  ) {
    super(code, 503, message, options)
  }
}
