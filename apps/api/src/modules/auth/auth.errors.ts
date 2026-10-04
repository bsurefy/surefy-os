// SPDX-License-Identifier: AGPL-3.0-only
import { ForbiddenError, NotFoundError } from '@/core/errors/index.js'
import { ERROR_CODES } from '@surefy/contracts'

/** Not one of the current user's sessions (another person's answers the same). */
export class SessionNotFoundError extends NotFoundError {
  constructor() {
    super(ERROR_CODES.AUTH_SESSION_NOT_FOUND, 'Session not found')
  }
}

/** `lastOrganizationId` must be an organization the person actively belongs to. */
export class LastOrganizationNotFoundError extends NotFoundError {
  constructor() {
    super(ERROR_CODES.ORGANIZATION_NOT_FOUND, 'Organization not found')
  }
}

/** `/me` endpoints need a signed-in person with a session (not an API key). */
export class SessionRequiredError extends ForbiddenError {
  constructor() {
    super(ERROR_CODES.ACCESS_FORBIDDEN, 'A signed-in session is required')
  }
}
