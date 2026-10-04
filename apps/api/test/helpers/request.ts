// SPDX-License-Identifier: AGPL-3.0-only
import { expect } from 'vitest'

import { errorResponse, okResponse, pageResponse } from '@surefy/contracts'

import type { FastifyInstance, InjectOptions, LightMyRequestResponse } from 'fastify'
import type { z } from 'zod'

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'

export interface RequestOptions {
  /** Session cookie or API key, from `authHeaders`. */
  headers?: Record<string, string>
  payload?: unknown
  query?: Record<string, string>
}

/** One request through the whole app, without a network port (`app.inject`). */
export const request = (
  app: FastifyInstance,
  method: HttpMethod,
  url: string,
  options: RequestOptions = {},
): Promise<LightMyRequestResponse> => {
  const inject: InjectOptions = { method, url }
  if (options.headers !== undefined) inject.headers = options.headers
  if (options.query !== undefined) inject.query = options.query
  if (options.payload !== undefined) inject.payload = options.payload as InjectOptions['payload']
  return app.inject(inject)
}

export type ErrorBody = z.infer<typeof errorResponse>

/**
 * Asserts the status and the error `code` (never the English message, testing.md §3) and
 * returns the parsed error envelope for further assertions on `details`.
 */
export function expectError(
  response: LightMyRequestResponse,
  statusCode: number,
  code: string,
): ErrorBody['error'] {
  expect(response.statusCode, `expected ${statusCode} ${code}, got ${response.body}`).toBe(
    statusCode,
  )
  const body = errorResponse.parse(response.json())
  expect(body.error.code).toBe(code)
  return body.error
}

/** Asserts the status and validates `{ data }` against the contract schema; returns `data`. */
export function expectData<Schema extends z.ZodType>(
  response: LightMyRequestResponse,
  statusCode: number,
  schema: Schema,
): z.infer<Schema> {
  expect(response.statusCode, `expected ${statusCode}, got ${response.body}`).toBe(statusCode)
  const body: unknown = okResponse(schema).parse(response.json())
  return (body as { data: z.infer<Schema> }).data
}

/** Asserts a 200 list response and validates every item against the contract schema. */
export function expectPage<Schema extends z.ZodType>(
  response: LightMyRequestResponse,
  schema: Schema,
): { data: z.infer<Schema>[]; nextCursor: string | null } {
  expect(response.statusCode, `expected 200, got ${response.body}`).toBe(200)
  const body = pageResponse(schema).parse(response.json())
  return { data: body.data, nextCursor: body.meta.nextCursor }
}

/** Asserts an empty 204. */
export function expectNoContent(response: LightMyRequestResponse): void {
  expect(response.statusCode, `expected 204, got ${response.body}`).toBe(204)
  expect(response.body).toBe('')
}
