// SPDX-License-Identifier: AGPL-3.0-only
import { VAULT_ERROR_CODES, type ConnectionFailureCode } from '@surefy/contracts'

/**
 * A search provider failure in SurefyOS's words. `reasonCode` is the contract's connection failure
 * code, so Vault stores and shows it like the failure of any other provider.
 */
export abstract class SearchProviderError extends Error {
  abstract readonly reasonCode: ConnectionFailureCode
}

/** The key is wrong, revoked or lacks access (401, 403). */
export class SearchAuthError extends SearchProviderError {
  readonly reasonCode = VAULT_ERROR_CODES.VAULT_KEY_INVALID
}

/** Too many requests, or the plan's quota is used up (429, quota statuses). */
export class SearchRateLimitError extends SearchProviderError {
  readonly reasonCode = VAULT_ERROR_CODES.VAULT_QUOTA_EXCEEDED
}

/** No answer in time. */
export class SearchTimeoutError extends SearchProviderError {
  readonly reasonCode = VAULT_ERROR_CODES.VAULT_TEST_TIMEOUT
}

/** Nothing reachable at the address, a 5xx, or an answer that is not what the provider sends. */
export class SearchUnavailableError extends SearchProviderError {
  readonly reasonCode = VAULT_ERROR_CODES.LOCAL_SERVER_UNREACHABLE
}

export const isSearchProviderError = (error: unknown): error is SearchProviderError =>
  error instanceof SearchProviderError
