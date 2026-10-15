// SPDX-License-Identifier: AGPL-3.0-only
import {
  SearchAuthError,
  SearchRateLimitError,
  SearchTimeoutError,
  SearchUnavailableError,
  type SearchProviderError,
} from '../search.errors.js'

/** The provider files' `fetch`; tests pass a fake through `createSearchProviders({ fetch })`. */
export type Fetch = typeof globalThis.fetch

/** Longest a single search waits for a provider. */
export const SEARCH_TIMEOUT_MS = 10_000

const HTTP_UNAUTHORIZED = 401
const HTTP_FORBIDDEN = 403
const HTTP_TOO_MANY = 429

/** Statuses beyond 429 that Tavily uses for a plan or pay-as-you-go limit. */
const QUOTA_STATUSES: ReadonlySet<number> = new Set([HTTP_TOO_MANY, 432, 433])

/** The failure of an HTTP answer in our words; the body is never kept. */
export function errorFromStatus(status: number): SearchProviderError {
  const message = `the search provider answered ${String(status)}`
  if (QUOTA_STATUSES.has(status)) return new SearchRateLimitError(message)
  if (status === HTTP_UNAUTHORIZED || status === HTTP_FORBIDDEN) return new SearchAuthError(message)
  return new SearchUnavailableError(message)
}

/**
 * One request to a provider, answered as JSON. An HTTP failure becomes our error, an abort a
 * timeout, a network failure (refused, DNS, TLS) an unreachable provider.
 */
export async function requestJson(
  fetchFn: Fetch,
  url: string,
  init: { method: 'GET' | 'POST'; headers: Record<string, string>; body?: string },
  signal: AbortSignal | undefined,
  onStatus: (status: number) => SearchProviderError = errorFromStatus,
): Promise<unknown> {
  const deadline = AbortSignal.timeout(SEARCH_TIMEOUT_MS)
  const combined = signal === undefined ? deadline : AbortSignal.any([signal, deadline])
  let response: Response
  try {
    response = await fetchFn(url, { ...init, signal: combined })
  } catch (error) {
    if (combined.aborted) throw new SearchTimeoutError('no answer in time')
    throw new SearchUnavailableError(error instanceof Error ? error.message : 'unreachable')
  }
  if (!response.ok) throw onStatus(response.status)
  try {
    return await response.json()
  } catch {
    throw new SearchUnavailableError('the answer was not JSON')
  }
}

export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

export const arrayOf = (value: unknown): unknown[] => (Array.isArray(value) ? value : [])

/** `https://host/` → `https://host`, so paths join with one slash. */
export const trimSlashes = (url: string): string => {
  let end = url.length
  while (end > 0 && url[end - 1] === '/') end -= 1
  return url.slice(0, end)
}
