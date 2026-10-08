// SPDX-License-Identifier: AGPL-3.0-only
import { CONNECTIONS_ERROR_CODES } from '@surefy/contracts'
import type { ConnectionSecret } from '@surefy/contracts'

import { CHECK_TIMEOUT_MS, TOKEN_TIMEOUT_MS } from '../connections.constants.js'
import { OutboundError } from '../connectionsHttp.js'
import { TokenRequestError } from './provider.types.js'

import type { CheckOutcome, OauthTokens } from './provider.types.js'
import type { HttpResult, OutboundHttp } from '../connectionsHttp.js'

// Shared by the adapters: form bodies, JSON answers, token answers and the mapping of an HTTP
// status to the reason a check failed.

export const formBody = (values: Record<string, string | undefined>): string =>
  new URLSearchParams(
    Object.entries(values).filter((entry): entry is [string, string] => entry[1] !== undefined),
  ).toString()

export const basicAuth = (user: string, password: string): string => {
  const credentials = `${user}:${password}`
  return `Basic ${Buffer.from(credentials).toString('base64')}`
}

export const bearer = (token: string): string => `Bearer ${token}`

/** The JSON object of an answer, or an empty object for anything else. */
export function jsonObject(result: Pick<HttpResult, 'text'>): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(result.text)
    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {}
  } catch {
    return {}
  }
}

export const asString = (value: unknown): string | null =>
  typeof value === 'string' && value !== '' ? value : null

const asNumber = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null

/** `scope` arrives space- or comma-separated, depending on the app. */
export const splitScopes = (value: unknown): string[] =>
  typeof value === 'string' ? value.split(/[\s,]+/).filter((scope) => scope !== '') : []

/**
 * A token request to an app. `denied`/`rejected` carry the app's error code; a network failure
 * is `unreachable` and may be retried.
 */
export async function requestTokens(
  call: () => Promise<HttpResult>,
  fallbackScopes: readonly string[],
): Promise<OauthTokens> {
  let result: HttpResult
  try {
    result = await call()
  } catch (error) {
    if (error instanceof OutboundError) {
      throw new TokenRequestError('unreachable', error.message, null, error.kind === 'unsafe')
    }
    throw error
  }
  return readTokens(result, fallbackScopes)
}

export function readTokens(result: HttpResult, fallbackScopes: readonly string[]): OauthTokens {
  const body = jsonObject(result)
  const providerCode = asString(body.error)
  const accessToken = asString(body.access_token)
  if (result.status >= 400 || providerCode !== null || accessToken === null) {
    const kind = providerCode === 'access_denied' ? 'denied' : 'rejected'
    throw new TokenRequestError(
      kind,
      asString(body.error_description) ?? providerCode ?? `HTTP ${result.status}`,
      providerCode,
    )
  }
  const scopes = splitScopes(body.scope)
  const refreshToken = asString(body.refresh_token)
  const expiresIn = asNumber(body.expires_in)
  return {
    accessToken,
    ...(refreshToken === null ? {} : { refreshToken }),
    ...(expiresIn === null ? {} : { expiresInSeconds: expiresIn }),
    scopes: scopes.length > 0 ? scopes : [...fallbackScopes],
  }
}

/** The reason an app's answer to a check call means the credentials do not work, or null. */
export function rejectionOf(status: number): CheckOutcome | null {
  if (status === 401 || status === 403 || status === 429 || status >= 500) {
    return {
      ok: false,
      reasonCode: CONNECTIONS_ERROR_CODES.CONNECTION_PROVIDER_REJECTED,
      latencyMs: null,
    }
  }
  return null
}

/** A check call: the network failure and the status map to the failure outcomes. */
export async function checkCall(
  call: () => Promise<HttpResult>,
  read: (result: HttpResult) => CheckOutcome,
): Promise<CheckOutcome> {
  let result: HttpResult
  try {
    result = await call()
  } catch (error) {
    if (!(error instanceof OutboundError)) throw error
    return {
      ok: false,
      reasonCode: CONNECTIONS_ERROR_CODES.CONNECTION_UNREACHABLE,
      latencyMs: null,
      ...(error.kind === 'unsafe' ? { unsafeAddress: true } : {}),
    }
  }
  const rejected = rejectionOf(result.status)
  return rejected === null ? read(result) : { ...rejected, latencyMs: result.latencyMs }
}

/** The `Authorization` header the stored credentials stand for; none for an open endpoint. */
export function authHeaders(secret: ConnectionSecret): Record<string, string> {
  if (secret.username !== undefined && secret.password !== undefined) {
    return { authorization: basicAuth(secret.username, secret.password) }
  }
  const token = secret.accessToken ?? secret.token ?? secret.apiKey
  if (token === undefined) return {}
  return {
    authorization: bearer(token),
    ...(secret.apiKey === undefined ? {} : { 'x-api-key': token }),
  }
}

export const checkRequest = (headers: Record<string, string>) => ({
  method: 'GET' as const,
  headers,
  timeoutMs: CHECK_TIMEOUT_MS,
})

export const tokenRequest = (headers: Record<string, string>, body: string) => ({
  method: 'POST' as const,
  headers: { 'content-type': 'application/x-www-form-urlencoded', ...headers },
  body,
  timeoutMs: TOKEN_TIMEOUT_MS,
})

export type { OutboundHttp }
