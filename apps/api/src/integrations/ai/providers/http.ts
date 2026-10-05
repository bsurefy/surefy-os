// SPDX-License-Identifier: AGPL-3.0-only
import {
  AiProviderError,
  providerErrorFromHttp,
  ProviderTimeoutError,
  ProviderUnavailableError,
} from '../ai.errors.js'

/** The provider files' `fetch`; tests pass a fake through `createAiProviders({ fetch })`. */
export type Fetch = typeof globalThis.fetch

/**
 * GET a provider's JSON endpoint: an HTTP failure becomes our error, an abort a timeout, and a
 * network failure (refused, DNS, TLS) an unreachable server.
 */
export async function getJson(
  fetchFn: Fetch,
  url: string,
  headers: Record<string, string>,
  signal: AbortSignal,
): Promise<unknown> {
  let response: Response
  try {
    response = await fetchFn(url, { headers, signal })
  } catch (error) {
    if (signal.aborted) throw new ProviderTimeoutError('no answer in time')
    throw new ProviderUnavailableError(error instanceof Error ? error.message : 'unreachable')
  }
  if (!response.ok) throw providerErrorFromHttp(response.status, await response.text())
  try {
    return await response.json()
  } catch {
    throw new ProviderUnavailableError('the answer was not JSON')
  }
}

export const isAiProviderError = (error: unknown): error is AiProviderError =>
  error instanceof AiProviderError

/** `https://host/v1/` → `https://host/v1`, so paths join with one slash. */
export const trimSlashes = (url: string): string => {
  let end = url.length
  while (end > 0 && url[end - 1] === '/') end -= 1
  return url.slice(0, end)
}
