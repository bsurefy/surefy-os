// SPDX-License-Identifier: AGPL-3.0-only
export { AppError, type AppErrorOptions, type ErrorDetail } from './AppError.js'
export {
  BadRequestError,
  ConflictError,
  ForbiddenError,
  InternalError,
  NotFoundError,
  PayloadTooLargeError,
  PaymentRequiredError,
  ServiceUnavailableError,
  TooManyRequestsError,
  UnauthorizedError,
  UnprocessableError,
} from './httpErrors.js'
