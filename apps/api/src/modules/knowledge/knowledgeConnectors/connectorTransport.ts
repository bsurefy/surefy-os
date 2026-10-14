// SPDX-License-Identifier: AGPL-3.0-only
import { setTimeout as sleep } from 'node:timers/promises'

import { OutboundError, type HttpResult, type OutboundHttp } from '@/modules/connections/index.js'
import { KNOWLEDGE_FILE_LIMITS } from '@surefy/contracts'

import {
  ConnectorExpiredError,
  ConnectorItemError,
  ConnectorUnavailableError,
} from './knowledgeConnectors.types.js'

import type { SafeGet } from '../knowledgeIngestion/safeFetch.js'

// How the connector clients reach Drive and Notion. API calls (small JSON answers) go through the
// connections module's outbound client; file bytes through `safeGet`, which keeps them binary and
// sends the access token to the API's own origin only. Answers map to the connector errors: 401
// is an expired sign-in, 429 and 5xx are outages the job retries, other 4xx belong to one item.

export interface ConnectorTransport {
  json(
    method: 'GET' | 'POST',
    url: string,
    token: string,
    options?: { body?: unknown; headers?: Record<string, string> },
  ): Promise<unknown>
  bytes(
    url: string,
    token: string,
    headers?: Record<string, string>,
  ): Promise<{ bytes: Buffer; mimeType: string | null }>
}

export interface ConnectorTransportDeps {
  http: OutboundHttp
  get: SafeGet
  /**
   * Set when the addresses are on the install's list of local hosts (stub servers in tests): API
   * calls go through `external` instead of `provider`, and downloads may reach these hosts.
   */
  localHosts?: readonly string[]
}

const TIMEOUT_MS = 20_000
/** Rate-limited calls are tried this many times, waiting what the provider asks (capped). */
const RATE_LIMIT_ATTEMPTS = 3
const RATE_LIMIT_WAIT_MAX_MS = 10_000

const isRateLimited = (result: HttpResult): boolean =>
  result.status === 429 ||
  (result.status === 403 && /rateLimitExceeded|userRateLimitExceeded/.test(result.text))

function waitOf(result: HttpResult, attempt: number): number {
  const header = Number(result.headers['retry-after'])
  const seconds = Number.isFinite(header) && header > 0 ? header : 2 ** attempt
  return Math.min(seconds * 1000, RATE_LIMIT_WAIT_MAX_MS)
}

function check(status: number, what: string): void {
  if (status === 401) throw new ConnectorExpiredError()
  if (status === 429 || status >= 500)
    throw new ConnectorUnavailableError(`${what} answered ${status}`)
  if (status >= 400) throw new ConnectorItemError(status, `${what} answered ${status}`)
}

export function createConnectorTransport(deps: ConnectorTransportDeps): ConnectorTransport {
  const call = (url: string, request: Parameters<OutboundHttp['provider']>[1]) =>
    deps.localHosts === undefined
      ? deps.http.provider(url, request)
      : deps.http.external(url, request)

  return {
    async json(method, url, token, options = {}) {
      const request = {
        method,
        headers: {
          authorization: `Bearer ${token}`,
          accept: 'application/json',
          ...(options.body === undefined ? {} : { 'content-type': 'application/json' }),
          ...options.headers,
        },
        ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
        timeoutMs: TIMEOUT_MS,
      }
      for (let attempt = 1; ; attempt += 1) {
        let result: HttpResult
        try {
          result = await call(url, request)
        } catch (error) {
          if (error instanceof OutboundError) throw new ConnectorUnavailableError(error.message)
          throw error
        }
        if (isRateLimited(result) && attempt < RATE_LIMIT_ATTEMPTS) {
          await sleep(waitOf(result, attempt))
          continue
        }
        if (isRateLimited(result)) throw new ConnectorUnavailableError('rate limited')
        check(result.status, new URL(url).pathname)
        try {
          return JSON.parse(result.text) as unknown
        } catch {
          throw new ConnectorUnavailableError('the answer is not JSON')
        }
      }
    },

    async bytes(url, token, headers = {}) {
      let response
      try {
        response = await deps.get(url, {
          timeoutMs: 60_000,
          maxBytes: KNOWLEDGE_FILE_LIMITS.maxBytes,
          userAgent: 'SurefyOS-Knowledge',
          headers: { authorization: `Bearer ${token}`, ...headers },
          ...(deps.localHosts === undefined ? {} : { localHosts: deps.localHosts }),
        })
      } catch (error) {
        throw new ConnectorItemError(0, error instanceof Error ? error.message : 'download failed')
      }
      check(response.status, 'download')
      const type = response.headers['content-type']?.split(';')[0]?.trim().toLowerCase()
      return { bytes: response.body, mimeType: type === undefined || type === '' ? null : type }
    },
  }
}
