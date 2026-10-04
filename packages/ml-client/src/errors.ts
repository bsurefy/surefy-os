// SPDX-License-Identifier: AGPL-3.0-only
import type { MlErrorEnvelope } from './types'

/** Error codes of the ML service (docs: guidelines/python/api-contract.md, section 5). */
export const ML_ERROR_CODES = [
  'ML_UNAUTHORIZED',
  'ML_NOT_FOUND',
  'ML_VALIDATION_FAILED',
  'ML_UNSUPPORTED_FILE',
  'ML_FILE_TOO_LARGE',
  'ML_FILE_DOWNLOAD_FAILED',
  'ML_TIMEOUT',
  'ML_BUSY',
  'ML_NOT_READY',
  'ML_INTERNAL_ERROR',
] as const

export type MlErrorCode = (typeof ML_ERROR_CODES)[number]

/** Codes the caller retries with backoff; `ML_TIMEOUT` is retried once only. */
export const ML_RETRYABLE_CODES: ReadonlySet<MlErrorCode> = new Set([
  'ML_FILE_DOWNLOAD_FAILED',
  'ML_TIMEOUT',
  'ML_BUSY',
  'ML_NOT_READY',
  'ML_INTERNAL_ERROR',
])

const KNOWN_CODES: ReadonlySet<string> = new Set(ML_ERROR_CODES)

/** The error code of a failed response body; unknown or missing codes are `ML_INTERNAL_ERROR`. */
export function mlErrorCode(body: unknown): MlErrorCode {
  const code = (body as Partial<MlErrorEnvelope> | undefined)?.error?.code
  return typeof code === 'string' && KNOWN_CODES.has(code)
    ? (code as MlErrorCode)
    : 'ML_INTERNAL_ERROR'
}
