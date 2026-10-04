// SPDX-License-Identifier: AGPL-3.0-only
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  UnprocessableError,
} from '@/core/errors/index.js'
import { ERROR_CODES, type LimitReachedDetail } from '@surefy/contracts'

export class OrganizationNotFoundError extends NotFoundError {
  constructor() {
    super(ERROR_CODES.ORGANIZATION_NOT_FOUND, 'Organization not found')
  }
}

/** Another organization uses the slug, or a retired slug of another organization redirects. */
export class OrganizationSlugTakenError extends ConflictError {
  constructor() {
    super(ERROR_CODES.ORGANIZATION_SLUG_TAKEN, 'This organization URL is taken')
  }
}

export class OrganizationSlugReservedError extends ConflictError {
  constructor() {
    super(ERROR_CODES.ORGANIZATION_SLUG_RESERVED, 'This organization URL is reserved')
  }
}

/** The install's creation policy does not let this person create organizations. */
export class OrganizationCreationNotAllowedError extends ForbiddenError {
  constructor() {
    super(
      ERROR_CODES.ORGANIZATION_CREATION_NOT_ALLOWED,
      'You are not allowed to create organizations on this install',
    )
  }
}

/** The install holds as many organizations as its entitlement source allows (ADR 0016). */
export class OrganizationLimitReachedError extends ForbiddenError {
  constructor(detail: LimitReachedDetail) {
    super(ERROR_CODES.LIMIT_REACHED, 'Organization limit reached', { details: [detail] })
  }
}

/** Not an IANA time zone the runtime knows. */
export class InvalidTimezoneError extends UnprocessableError {
  constructor() {
    super(ERROR_CODES.VALIDATION_FAILED, 'Unknown time zone', {
      details: [{ path: 'timezone', code: 'invalid_value', message: 'Unknown time zone' }],
    })
  }
}
