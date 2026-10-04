// SPDX-License-Identifier: AGPL-3.0-only
import createClient, { type Client, type Middleware } from 'openapi-fetch'

import type { paths } from './generated/schema'

export type MlClient = Client<paths>

export interface MlClientOptions {
  /** Base URL of the ML service, for example `http://ml:8000` (`ML_SERVICE_URL`). */
  baseUrl: string
  /** Shared secret, sent as `Authorization: Bearer …` (`ML_SERVICE_TOKEN`). */
  serviceToken: string
  /** Replaces the global fetch (tests, custom agents). */
  fetch?: typeof globalThis.fetch
}

/**
 * Typed client for the ML service. Every request carries the service token; pass the caller's
 * request ID per call as the `x-request-id` header so logs correlate across services:
 *
 * ```ts
 * await ml.POST('/v1/documents/parse', { body, headers: { 'x-request-id': reqId }, signal })
 * ```
 */
export function createMlClient(options: MlClientOptions): MlClient {
  const client = createClient<paths>({
    baseUrl: trimTrailingSlashes(options.baseUrl),
    ...(options.fetch ? { fetch: options.fetch } : {}),
  })
  const auth: Middleware = {
    onRequest({ request }) {
      request.headers.set('authorization', `Bearer ${options.serviceToken}`)
      return request
    },
  }
  client.use(auth)
  return client
}

function trimTrailingSlashes(url: string): string {
  let end = url.length
  while (end > 0 && url[end - 1] === '/') end -= 1
  return url.slice(0, end)
}
