// SPDX-License-Identifier: AGPL-3.0-only
// @vitest-environment node
import { HttpResponse } from 'msw'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { z } from 'zod'

import { ERROR_CODES, errorResponse, okResponse, pageResponse } from '@surefy/contracts'

import { defineMockHandler } from './defineMockHandler'
import { MOCK_REQUEST_ID_PREFIX, SCENARIO_RESPONSE_HEADER } from './mock.constants'
import { configureMockScenarios, resetMockSettings } from './mockSettings'
import { mockError, mockOk } from './responses'
import { createTestServer } from '../msw/createTestServer'

const BASE_URL = 'http://api.test/api/v1'
const item = z.object({ id: z.string(), name: z.string() })
const items = [
  { id: 'i1', name: 'One' },
  { id: 'i2', name: 'Two' },
]

const listHandler = defineMockHandler({
  method: 'get',
  path: '/items',
  response: pageResponse(item),
  scenarios: {
    default: () => ({ data: items, meta: { nextCursor: null } }),
    // a handler-specific scenario, and a wrong one to prove the validation
    'one-page': () => ({
      data: [items[0] ?? { id: 'i1', name: 'One' }],
      meta: { nextCursor: 'c2' },
    }),
    broken: () => ({ data: [{ id: 42 }], meta: { nextCursor: null } }) as never,
    'bad-error': () => HttpResponse.json({ error: { code: 'TEAPOT' } }, { status: 418 }),
  },
})

const detailHandler = defineMockHandler({
  method: 'get',
  path: '/items/:id',
  response: okResponse(item),
  scenarios: {
    default: ({ params }) =>
      params.id === 'i1' ? mockOk(items[0]) : mockError(404, ERROR_CODES.NOT_FOUND, 'Not found'),
  },
})

const { server, takeViolations } = createTestServer(listHandler, detailHandler)

beforeAll(() => {
  server.listen({ onUnhandledFrame: 'error' })
})
afterEach(() => {
  resetMockSettings()
  takeViolations()
})
afterAll(() => {
  server.close()
})

async function get(path: string, init?: RequestInit) {
  return fetch(`${BASE_URL}${path}`, init)
}

describe('defineMockHandler', () => {
  it('answers the default scenario with the handler data, tagged with the scenario', async () => {
    const response = await get('/items')

    expect(response.status).toBe(200)
    expect(response.headers.get(SCENARIO_RESPONSE_HEADER)).toBe('default')
    await expect(response.json()).resolves.toEqual({ data: items, meta: { nextCursor: null } })
  })

  it('reads path parameters and lets a scenario answer with a full response', async () => {
    const found = await get('/items/i1')
    const missing = await get('/items/nope')

    await expect(found.json()).resolves.toEqual({ data: items[0] })
    expect(missing.status).toBe(404)
    const body = errorResponse.parse(await missing.json())
    expect(body.error.code).toBe(ERROR_CODES.NOT_FOUND)
  })

  it('picks the scenario from the query, then the header, then the cookie, then the default', async () => {
    const byQuery = await get('/items?scenario=error', {
      headers: { 'x-mock-scenario': 'forbidden', cookie: 'scenario=gated' },
    })
    const byHeader = await get('/items', {
      headers: { 'x-mock-scenario': 'forbidden', cookie: 'scenario=gated' },
    })
    const byCookie = await get('/items', { headers: { cookie: 'theme=dark; scenario=gated' } })
    configureMockScenarios({ defaultScenario: 'limit' })
    const byDefault = await get('/items')

    expect(byQuery.headers.get(SCENARIO_RESPONSE_HEADER)).toBe('error')
    expect(byHeader.headers.get(SCENARIO_RESPONSE_HEADER)).toBe('forbidden')
    expect(byCookie.headers.get(SCENARIO_RESPONSE_HEADER)).toBe('gated')
    expect(byDefault.headers.get(SCENARIO_RESPONSE_HEADER)).toBe('limit')
  })

  it.each([
    ['error', 500, ERROR_CODES.INTERNAL_ERROR],
    ['forbidden', 403, ERROR_CODES.ACCESS_FORBIDDEN],
    ['gated', 403, ERROR_CODES.FEATURE_NOT_AVAILABLE],
    ['limit', 403, ERROR_CODES.LIMIT_REACHED],
  ])(
    'answers the built-in %s scenario with %i %s and a request id',
    async (scenario, status, code) => {
      const response = await get(`/items?scenario=${scenario}`)

      expect(response.status).toBe(status)
      const body = errorResponse.parse(await response.json())
      expect(body.error.code).toBe(code)
      expect(body.error.requestId.startsWith(MOCK_REQUEST_ID_PREFIX)).toBe(true)
    },
  )

  it('answers empty with an empty page for lists and the default for single resources', async () => {
    const list = await get('/items?scenario=empty')
    const detail = await get('/items/i1?scenario=empty')

    await expect(list.json()).resolves.toEqual({ data: [], meta: { nextCursor: null } })
    await expect(detail.json()).resolves.toEqual({ data: items[0] })
  })

  it('fails the request in the offline scenario', async () => {
    await expect(get('/items?scenario=offline')).rejects.toThrow()
  })

  it('waits for the configured delay in the slow scenario', async () => {
    configureMockScenarios({ slowDelayMs: 120 })
    const started = Date.now()

    const response = await get('/items?scenario=slow')

    expect(Date.now() - started).toBeGreaterThanOrEqual(100)
    await expect(response.json()).resolves.toEqual({ data: items, meta: { nextCursor: null } })
  })

  it('prefers the handler scenario and falls back to default for an unknown name', async () => {
    const own = await get('/items?scenario=one-page')
    const unknown = await get('/items?scenario=no-such-scenario')

    await expect(own.json()).resolves.toEqual({ data: [items[0]], meta: { nextCursor: 'c2' } })
    expect(unknown.headers.get(SCENARIO_RESPONSE_HEADER)).toBe('no-such-scenario')
    await expect(unknown.json()).resolves.toEqual({ data: items, meta: { nextCursor: null } })
  })

  it('rejects a response that breaks its contract and records the violation', async () => {
    const response = await get('/items?scenario=broken')

    expect(response.status).toBe(500)
    const [violation, ...rest] = takeViolations()
    expect(rest).toHaveLength(0)
    expect(violation?.info).toMatchObject({ method: 'get', path: '/items', scenario: 'broken' })
    expect(violation?.message).toContain('GET /items')
    expect(violation?.message).toContain('data[0].id')
  })

  it('validates error responses against the error envelope', async () => {
    const response = await get('/items?scenario=bad-error')

    expect(response.status).toBe(500)
    expect(takeViolations()[0]?.info.status).toBe(418)
  })
})
