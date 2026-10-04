// SPDX-License-Identifier: AGPL-3.0-only
import { HttpResponse } from 'msw'

import type { ErrorResponse, Page } from '@surefy/contracts'

import { MOCK_REQUEST_ID_PREFIX } from './mock.constants'
import { API_PREFIX } from '../../http/http.constants'

import type { HttpResponseInit, JsonBodyType } from 'msw'

const REQUEST_ID_LENGTH = 8

/** A request ID in the API's shape, unique enough to tell two mocked errors apart. */
export function mockRequestId(): string {
  return `${MOCK_REQUEST_ID_PREFIX}${globalThis.crypto.randomUUID().slice(0, REQUEST_ID_LENGTH)}`
}

/** `{ data }`: the body of a single-resource response (services-api.md §1). */
export function okBody<Data>(data: Data): { data: Data } {
  return { data }
}

/** `{ data: [...], meta: { nextCursor } }`: the body of a list response. */
export function pageBody<Item>(items: Item[], nextCursor: string | null = null): Page<Item> {
  return { data: items, meta: { nextCursor } }
}

export interface ErrorBodyOptions {
  details?: Record<string, unknown>[]
  requestId?: string
}

/** `{ error }`: the body of an error response, with a mock request ID unless one is given. */
export function errorBody(
  code: string,
  message: string,
  options: ErrorBodyOptions = {},
): ErrorResponse {
  return {
    error: {
      code,
      message,
      requestId: options.requestId ?? mockRequestId(),
      details: options.details ?? [],
    },
  }
}

/** A JSON response carrying `{ data }`; pass `{ status: 201 }` for a creation. */
export function mockOk<Data extends JsonBodyType>(
  data: Data,
  init?: HttpResponseInit,
): HttpResponse<{ data: Data }> {
  return HttpResponse.json(okBody(data), init)
}

/** A JSON response carrying a page of items. */
export function mockPage<Item extends JsonBodyType>(
  items: Item[],
  nextCursor: string | null = null,
  init?: HttpResponseInit,
): HttpResponse<Page<Item>> {
  return HttpResponse.json(pageBody(items, nextCursor), init)
}

/** A JSON error response in the API's envelope. */
export function mockError(
  status: number,
  code: string,
  message: string,
  options: ErrorBodyOptions = {},
) {
  return HttpResponse.json(errorBody(code, message, options), { status })
}

/** The request never reaches the API: the client sees a network error (`NETWORK_ERROR`). */
export function mockOffline() {
  return HttpResponse.error()
}

/**
 * The MSW path of an API route, matched on any origin: the browser client calls its own origin,
 * the server client the internal URL and the dev mock server the API port.
 */
export function mockPath(path: string, prefix = API_PREFIX): string {
  return `*${prefix}${path}`
}
