// SPDX-License-Identifier: AGPL-3.0-only
import { ConflictError, NotFoundError, UnprocessableError } from '@/core/errors/index.js'
import { ERROR_CODES } from '@surefy/contracts'

export class ApiKeyNotFoundError extends NotFoundError {
  constructor() {
    super(ERROR_CODES.API_KEY_NOT_FOUND, 'API key not found')
  }
}

/** A revoked key is final: it cannot be renamed or revoked again. */
export class ApiKeyRevokedError extends ConflictError {
  constructor() {
    super(ERROR_CODES.API_KEY_REVOKED, 'This API key was revoked')
  }
}

/** The scope is not a known permission, or keys cannot carry it. */
export class ApiKeyScopeNotAllowedError extends UnprocessableError {
  constructor(scope: string) {
    super(ERROR_CODES.API_KEY_SCOPE_NOT_ALLOWED, 'This permission cannot be given to an API key', {
      details: [{ field: 'scopes', scope }],
    })
  }
}

export class ApiKeyExpiryInvalidError extends UnprocessableError {
  constructor() {
    super(ERROR_CODES.API_KEY_EXPIRY_INVALID, 'The expiry must be in the future')
  }
}

/** A key never carries more than its creator holds (`ACCESS_EXCEEDS_PARENT`). */
export class ApiKeyScopeExceedsCreatorError extends UnprocessableError {
  constructor(scopes: readonly string[]) {
    super(ERROR_CODES.ACCESS_EXCEEDS_PARENT, 'This allows more than you have yourself', {
      details: scopes.map((scope) => ({
        field: `scopes.${scope}`,
        parentValue: false,
        parentSource: 'role',
      })),
    })
  }
}
