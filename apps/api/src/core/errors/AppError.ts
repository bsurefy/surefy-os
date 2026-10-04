// SPDX-License-Identifier: AGPL-3.0-only
import type { ErrorCode } from '@surefy/contracts'

/** One field-level problem sent to the client (validation errors, limits). */
export type ErrorDetail = Record<string, unknown>

export interface AppErrorOptions {
  /** Sent to the client; only for validation-like errors where field paths help. */
  details?: ErrorDetail[]
  /** Logged only, never sent. */
  meta?: Record<string, unknown>
  cause?: unknown
}

/**
 * Base of every expected error. The global error handler turns it into the error envelope with
 * its `statusCode` and `code`; anything else becomes `INTERNAL_ERROR`.
 */
export class AppError extends Error {
  constructor(
    readonly code: ErrorCode,
    readonly statusCode: number,
    message: string,
    readonly options: AppErrorOptions = {},
  ) {
    super(message, { cause: options.cause })
    this.name = new.target.name
  }
}
