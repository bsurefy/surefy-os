// SPDX-License-Identifier: AGPL-3.0-only
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  UnprocessableError,
} from '@/core/errors/index.js'
import { CONNECTIONS_ERROR_CODES, ERROR_CODES } from '@surefy/contracts'

export class ConnectionNotFoundError extends NotFoundError {
  constructor() {
    super(CONNECTIONS_ERROR_CODES.CONNECTION_NOT_FOUND, 'Connection not found')
  }
}

/** A disconnected account is final: it cannot change, reconnect or be tested. */
export class ConnectionRevokedError extends ConflictError {
  constructor() {
    super(CONNECTIONS_ERROR_CODES.CONNECTION_REVOKED, 'This connection was disconnected')
  }
}

export class ConnectionProviderUnsupportedError extends UnprocessableError {
  constructor(providerKey: string) {
    super(CONNECTIONS_ERROR_CODES.CONNECTION_PROVIDER_UNSUPPORTED, 'This app cannot be connected', {
      details: [{ field: 'providerKey', providerKey }],
    })
  }
}

export class ConnectionAuthTypeUnsupportedError extends UnprocessableError {
  constructor(providerKey: string, authType: string) {
    super(
      CONNECTIONS_ERROR_CODES.CONNECTION_AUTH_TYPE_UNSUPPORTED,
      'This app does not sign in this way',
      { details: [{ field: 'authType', providerKey, authType }] },
    )
  }
}

export class ConnectionBaseUrlNotAllowedError extends UnprocessableError {
  constructor(field: string, message = 'This address is not allowed') {
    super(CONNECTIONS_ERROR_CODES.CONNECTION_BASE_URL_NOT_ALLOWED, message, {
      details: [{ field }],
    })
  }
}

/** The same account is already connected in this scope; the id is the one to reconnect. */
export class ConnectionDuplicateError extends ConflictError {
  constructor(existingId: string) {
    super(CONNECTIONS_ERROR_CODES.CONNECTION_DUPLICATE, 'This account is already connected here', {
      details: [{ existingConnectionId: existingId }],
    })
  }
}

export class ConnectionAccountMismatchError extends UnprocessableError {
  constructor(expectedLabel: string | null) {
    super(
      CONNECTIONS_ERROR_CODES.CONNECTION_ACCOUNT_MISMATCH,
      'You signed in to a different account',
      { details: [{ expectedAccount: expectedLabel }] },
    )
  }
}

export class ConnectionOauthStateInvalidError extends UnprocessableError {
  constructor() {
    super(
      CONNECTIONS_ERROR_CODES.CONNECTION_OAUTH_STATE_INVALID,
      'That sign-in took too long or was already used',
    )
  }
}

export class ConnectionOauthDeniedError extends UnprocessableError {
  constructor(reason: string | null) {
    super(
      CONNECTIONS_ERROR_CODES.CONNECTION_OAUTH_DENIED,
      reason ?? 'The app did not finish connecting',
    )
  }
}

/** A field is missing or does not belong to this app. */
export class ConnectionFieldInvalidError extends UnprocessableError {
  constructor(field: string, message: string) {
    super(ERROR_CODES.VALIDATION_FAILED, message, { details: [{ field }] })
  }
}

/** The check on save failed: nothing is stored, the code says why. */
export class ConnectionCheckFailedError extends UnprocessableError {}

/** The person may not add this scope, or use or change this connection. */
export class ConnectionForbiddenError extends ForbiddenError {
  constructor() {
    super(ERROR_CODES.ACCESS_FORBIDDEN, 'You cannot do this with this connection')
  }
}

export class ConnectionTeamNotFoundError extends NotFoundError {
  constructor() {
    super(ERROR_CODES.TEAM_NOT_FOUND, 'Team not found')
  }
}
