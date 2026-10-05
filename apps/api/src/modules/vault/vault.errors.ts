// SPDX-License-Identifier: AGPL-3.0-only
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  UnprocessableError,
} from '@/core/errors/index.js'
import { ERROR_CODES } from '@surefy/contracts'

export class VaultCredentialNotFoundError extends NotFoundError {
  constructor() {
    super(ERROR_CODES.VAULT_CREDENTIAL_NOT_FOUND, 'Key or server not found')
  }
}

export class VaultCredentialRevokedError extends ConflictError {
  constructor() {
    super(ERROR_CODES.VAULT_CREDENTIAL_REVOKED, 'This key was revoked')
  }
}

export class VaultPersonalKeysDisabledError extends ForbiddenError {
  constructor() {
    super(ERROR_CODES.VAULT_PERSONAL_KEYS_DISABLED, 'Personal keys are turned off here')
  }
}

export class VaultProviderNotAllowedError extends ForbiddenError {
  constructor() {
    super(ERROR_CODES.VAULT_PROVIDER_NOT_ALLOWED, 'This provider is not allowed here')
  }
}

export class VaultRotationMismatchError extends UnprocessableError {
  constructor() {
    super(
      ERROR_CODES.VAULT_ROTATION_MISMATCH,
      'A replacement must keep the provider and scope of the key it replaces',
    )
  }
}

export class VaultServerInUseError extends ConflictError {
  constructor() {
    super(
      ERROR_CODES.VAULT_SERVER_IN_USE,
      'A model of this server is the embedding model; choose another embedding model first',
    )
  }
}

/** A save whose connection test did not pass: nothing is stored; the code says why. */
export class VaultConnectionFailedError extends UnprocessableError {}

/** A team or person named in a key, a server or an access rule is not in the organization. */
export class VaultTeamNotFoundError extends NotFoundError {
  constructor() {
    super(ERROR_CODES.TEAM_NOT_FOUND, 'Team not found')
  }
}

export class VaultMemberNotFoundError extends NotFoundError {
  constructor() {
    super(ERROR_CODES.MEMBER_NOT_FOUND, 'Member not found')
  }
}

export class ModelNotFoundError extends NotFoundError {
  constructor() {
    super(ERROR_CODES.MODEL_NOT_FOUND, 'Model not found')
  }
}

export class ModelEmbeddingInvalidError extends UnprocessableError {
  constructor() {
    super(
      ERROR_CODES.MODEL_EMBEDDING_INVALID,
      'The embedding model must be an enabled embedding model',
    )
  }
}
