// SPDX-License-Identifier: AGPL-3.0-only
import { ApiError } from './ApiError'
import { API_PREFIX } from './http.constants'

import type { HttpClient, HttpClientConfig, Page, RequestOptions } from './http.types'

interface Envelope<T> {
  data: T
  meta?: { nextCursor: string | null }
}

const NO_CONTENT = 204

/** Transport-agnostic request logic: builds the URL, unwraps the envelope, throws `ApiError`. */
export function createHttpClient({ getBaseUrl, getHeaders }: HttpClientConfig): HttpClient {
  async function request<T>(
    method: string,
    path: string,
    { params, headers, signal }: RequestOptions = {},
    body?: unknown,
  ): Promise<Envelope<T>> {
    const url = new URL(`${API_PREFIX}${path}`, getBaseUrl())
    for (const [key, value] of Object.entries(params ?? {}))
      if (value !== undefined) url.searchParams.set(key, String(value))

    const response = await fetch(url, {
      method,
      credentials: 'include',
      headers: {
        // only with a body: Fastify rejects an empty body sent as application/json
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
        ...(await getHeaders?.()),
        ...headers,
      },
      body: body === undefined ? null : JSON.stringify(body),
      signal: signal ?? null,
    }).catch((cause: unknown) => {
      throw ApiError.network(cause)
    })

    if (response.status === NO_CONTENT) return { data: undefined as T }
    const payload: unknown = await response.json().catch(() => null)
    if (!response.ok) throw ApiError.fromResponse(response.status, payload)
    return payload as Envelope<T>
  }

  return {
    get: async <T>(path: string, options?: RequestOptions) =>
      (await request<T>('GET', path, options)).data,
    getPage: async <T>(path: string, options?: RequestOptions): Promise<Page<T>> => {
      const { data, meta } = await request<T[]>('GET', path, options)
      return { items: data, nextCursor: meta?.nextCursor ?? null }
    },
    post: async <T>(path: string, body?: unknown, options?: RequestOptions) =>
      (await request<T>('POST', path, options, body)).data,
    patch: async <T>(path: string, body?: unknown, options?: RequestOptions) =>
      (await request<T>('PATCH', path, options, body)).data,
    put: async <T>(path: string, body?: unknown, options?: RequestOptions) =>
      (await request<T>('PUT', path, options, body)).data,
    delete: async (path: string, options?: RequestOptions) => {
      await request('DELETE', path, options)
    },
  }
}
