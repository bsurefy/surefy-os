// SPDX-License-Identifier: AGPL-3.0-only
// Provider-agnostic errors of the ML service adapter (integrations.md, §5). Business code
// translates them: unavailable errors are retried with backoff, the others are final.

export class MlError extends Error {
  constructor(
    message: string,
    /** The service's error code, `ML_INTERNAL_ERROR` when the service was not reached. */
    readonly mlCode: string,
    options?: { cause?: unknown },
  ) {
    super(message, options)
    this.name = new.target.name
  }
}

/** The service could not serve the call now (busy, not ready, download failed, unreachable); retryable. */
export class MlUnavailableError extends MlError {}

/** The call took too long; retried once, a second timeout on the same input is final. */
export class MlTimeoutError extends MlError {}

/** The file type cannot be parsed (`ML_UNSUPPORTED_FILE`); never retried. */
export class MlUnsupportedFileError extends MlError {}

/** The request itself is wrong (token, validation, size, unknown route); never retried. */
export class MlInputError extends MlError {}
