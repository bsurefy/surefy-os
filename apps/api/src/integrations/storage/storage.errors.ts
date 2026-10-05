// SPDX-License-Identifier: AGPL-3.0-only
// Provider-agnostic errors. Providers map vendor failures to these; services translate them into
// domain errors. Vendor error shapes never leave the provider file.

export class StorageError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options)
    this.name = new.target.name
  }
}

/** The key does not point at a stored object. */
export class StorageNotFoundError extends StorageError {
  constructor(
    readonly key: string,
    options?: { cause?: unknown },
  ) {
    super(`object not found: ${key}`, options)
  }
}

/** A key that could escape its prefix or is not a valid object key. */
export class StorageInvalidKeyError extends StorageError {
  constructor(readonly key: string) {
    super(`invalid storage key: ${key}`)
  }
}

/** The provider failed or is unreachable; retryable. */
export class StorageUnavailableError extends StorageError {
  constructor(operation: string, options?: { cause?: unknown }) {
    super(`storage ${operation} failed`, options)
  }
}
