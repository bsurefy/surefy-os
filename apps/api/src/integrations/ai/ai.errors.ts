// SPDX-License-Identifier: AGPL-3.0-only
import { APICallError, RetryError } from 'ai'

import { VAULT_ERROR_CODES, type ConnectionFailureCode } from '@surefy/contracts'

/**
 * A provider failure in SurefyOS's words (integrations.md, §1). `reasonCode` is the contract's
 * connection failure code; `isUnavailable` failures let the gateway fall back to the next model.
 */
export abstract class AiProviderError extends Error {
  abstract readonly reasonCode: ConnectionFailureCode
  /** The provider could not serve the call now; the next model may. */
  abstract readonly isUnavailable: boolean
}

/** The key is wrong, revoked or lacks access (401, 403). */
export class ProviderAuthError extends AiProviderError {
  readonly reasonCode = VAULT_ERROR_CODES.VAULT_KEY_INVALID
  readonly isUnavailable = false
}

/** Too many requests, or the account's quota or credit is used up (429, quota errors). */
export class ProviderRateLimitError extends AiProviderError {
  readonly reasonCode = VAULT_ERROR_CODES.VAULT_QUOTA_EXCEEDED
  readonly isUnavailable = true
  constructor(
    message: string,
    /** True for a used-up quota; false for a short rate limit. */
    readonly isQuota: boolean,
  ) {
    super(message)
  }
}

/** The provider refuses this region (451, region errors). */
export class ProviderRegionError extends AiProviderError {
  readonly reasonCode = VAULT_ERROR_CODES.VAULT_REGION_BLOCKED
  readonly isUnavailable = false
}

/** No answer in time. */
export class ProviderTimeoutError extends AiProviderError {
  readonly reasonCode = VAULT_ERROR_CODES.VAULT_TEST_TIMEOUT
  readonly isUnavailable = true
}

/** Nothing reachable at the address, or the provider answered 5xx. */
export class ProviderUnavailableError extends AiProviderError {
  readonly reasonCode = VAULT_ERROR_CODES.LOCAL_SERVER_UNREACHABLE
  readonly isUnavailable = true
}

const QUOTA_HINT = /quota|insufficient|billing|credit/i
const REGION_HINT = /region|country|location is not supported|unsupported_country/i
const HTTP_UNAUTHORIZED = 401
const HTTP_FORBIDDEN = 403
const HTTP_TOO_MANY = 429
const HTTP_UNAVAILABLE_FOR_LEGAL = 451

/** Maps an HTTP failure of a provider to our error; the body only picks between related cases. */
export function providerErrorFromHttp(status: number, body: string): AiProviderError {
  const message = `provider answered ${String(status)}`
  if (status === HTTP_UNAVAILABLE_FOR_LEGAL || REGION_HINT.test(body)) {
    return new ProviderRegionError(message)
  }
  if (status === HTTP_TOO_MANY) return new ProviderRateLimitError(message, QUOTA_HINT.test(body))
  if (status === HTTP_UNAUTHORIZED || status === HTTP_FORBIDDEN) {
    return QUOTA_HINT.test(body)
      ? new ProviderRateLimitError(message, true)
      : new ProviderAuthError(message)
  }
  // 5xx and anything unexpected: the provider cannot serve the call now
  return new ProviderUnavailableError(message)
}

/**
 * A failure thrown during an AI SDK call (`generateText`, `streamText`, `embedMany`) as our
 * error: the SDK's API call errors by status, aborts by our timeout, network failures as
 * unreachable. Null for anything that is not a provider failure (a bug, a schema mismatch).
 */
export function providerErrorFrom(error: unknown, timedOut = false): AiProviderError | null {
  if (error instanceof AiProviderError) return error
  if (timedOut) return new ProviderTimeoutError('no answer in time')
  if (APICallError.isInstance(error)) {
    if (error.statusCode === undefined) return new ProviderUnavailableError(error.message)
    return providerErrorFromHttp(error.statusCode, error.responseBody ?? '')
  }
  if (RetryError.isInstance(error)) return providerErrorFrom(error.lastError)
  if (error instanceof TypeError && /fetch failed|network/i.test(error.message)) {
    return new ProviderUnavailableError(error.message)
  }
  return null
}
