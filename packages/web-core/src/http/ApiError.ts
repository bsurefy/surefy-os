// SPDX-License-Identifier: AGPL-3.0-only
import { z } from 'zod'

import { CLIENT_ERROR_CODES, ERROR_CODES, errorResponse } from '@surefy/contracts'

import { NETWORK_ERROR_STATUS } from './http.constants'

import type { ApiErrorCode, ErrorDetail } from './http.types'

const KNOWN_CODES = new Set<string>(Object.values(ERROR_CODES))

// The contract types a detail as a loose record; only the field-level shape is useful to the UI.
const errorDetail = z.object({ path: z.string(), code: z.string(), message: z.string() }).loose()

function isKnownCode(code: string): code is ApiErrorCode {
  return KNOWN_CODES.has(code)
}

function toDetails(records: Record<string, unknown>[]): ErrorDetail[] {
  return records.flatMap((record) => {
    const parsed = errorDetail.safeParse(record)
    if (!parsed.success) return []
    const { path, code, message } = parsed.data
    return [{ path, code, message }]
  })
}

/** Every failure of the HTTP client, from the API's error envelope or from the transport itself. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: ApiErrorCode,
    message: string,
    readonly details: ErrorDetail[] = [],
    readonly requestId?: string,
  ) {
    super(message)
    this.name = 'ApiError'
  }

  /** A non-2xx response. Anything that is not the `{ error }` envelope becomes `UNKNOWN_ERROR`. */
  static fromResponse(status: number, payload: unknown): ApiError {
    const parsed = errorResponse.safeParse(payload)
    if (!parsed.success)
      return new ApiError(
        status,
        CLIENT_ERROR_CODES.UNKNOWN_ERROR,
        `Request failed with status ${status}`,
      )

    const { code, message, details, requestId } = parsed.data.error
    // A code the contracts do not know cannot be branched on, so it is reported as unknown.
    const knownCode = isKnownCode(code) ? code : CLIENT_ERROR_CODES.UNKNOWN_ERROR
    return new ApiError(status, knownCode, message, toDetails(details), requestId)
  }

  /** `fetch` itself rejected: offline, DNS, blocked or aborted. */
  static network(cause: unknown): ApiError {
    const error = new ApiError(
      NETWORK_ERROR_STATUS,
      CLIENT_ERROR_CODES.NETWORK_ERROR,
      cause instanceof Error ? cause.message : 'Network request failed',
    )
    error.cause = cause
    return error
  }
}
