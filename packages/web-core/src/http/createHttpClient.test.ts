// SPDX-License-Identifier: AGPL-3.0-only
// @vitest-environment node
import { HttpResponse, http } from 'msw'
import { setupServer } from 'msw/node'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'

import { CLIENT_ERROR_CODES, ERROR_CODES } from '@surefy/contracts'

import { ApiError } from './ApiError'
import { createHttpClient } from './createHttpClient'

const BASE_URL = 'http://api.test'
const server = setupServer()

beforeAll(() => {
  server.listen({ onUnhandledFrame: 'error' })
})
afterEach(() => {
  server.resetHandlers()
})
afterAll(() => {
  server.close()
})

const client = createHttpClient({ getBaseUrl: () => BASE_URL })

describe('createHttpClient', () => {
  it('prefixes the path with the API prefix and unwraps the data envelope', async () => {
    server.use(
      http.get(`${BASE_URL}/api/v1/agents/a1`, () =>
        HttpResponse.json({ data: { id: 'a1', name: 'Support Agent' } }),
      ),
    )

    await expect(client.get('/agents/a1')).resolves.toEqual({ id: 'a1', name: 'Support Agent' })
  })

  it('turns a list envelope into a page', async () => {
    server.use(
      http.get(`${BASE_URL}/api/v1/agents`, () =>
        HttpResponse.json({ data: [{ id: 'a1' }], meta: { nextCursor: 'c2' } }),
      ),
    )

    await expect(client.getPage('/agents')).resolves.toEqual({
      items: [{ id: 'a1' }],
      nextCursor: 'c2',
    })
  })

  it('appends defined params to the query string and skips undefined ones', async () => {
    let search = ''
    server.use(
      http.get(`${BASE_URL}/api/v1/agents`, ({ request }) => {
        search = new URL(request.url).search
        return HttpResponse.json({ data: [], meta: { nextCursor: null } })
      }),
    )

    await client.getPage('/agents', { params: { limit: 25, active: true, cursor: undefined } })

    expect(search).toBe('?limit=25&active=true')
  })

  it('sends a JSON body with the content type, and no content type without a body', async () => {
    const seen: { contentType: string | null; body: string }[] = []
    server.use(
      http.post(`${BASE_URL}/api/v1/agents`, async ({ request }) => {
        seen.push({ contentType: request.headers.get('content-type'), body: await request.text() })
        return HttpResponse.json({ data: { id: 'a2' } }, { status: 201 })
      }),
    )

    await client.post('/agents', { name: 'New' })
    await client.post('/agents')

    expect(seen).toEqual([
      { contentType: 'application/json', body: '{"name":"New"}' },
      { contentType: null, body: '' },
    ])
  })

  it('merges the client headers with the per-request headers', async () => {
    let received: Record<string, string | null> = {}
    server.use(
      http.patch(`${BASE_URL}/api/v1/agents/a1`, ({ request }) => {
        received = {
          cookie: request.headers.get('cookie'),
          idempotency: request.headers.get('idempotency-key'),
        }
        return HttpResponse.json({ data: { id: 'a1' } })
      }),
    )
    const withHeaders = createHttpClient({
      getBaseUrl: () => BASE_URL,
      getHeaders: () => Promise.resolve({ cookie: 'sid=1' }),
    })

    await withHeaders.patch('/agents/a1', {}, { headers: { 'idempotency-key': 'k1' } })

    expect(received).toEqual({ cookie: 'sid=1', idempotency: 'k1' })
  })

  it('resolves a 204 response without reading a body', async () => {
    server.use(
      http.delete(`${BASE_URL}/api/v1/agents/a1`, () => new HttpResponse(null, { status: 204 })),
    )

    await expect(client.delete('/agents/a1')).resolves.toBeUndefined()
  })

  it('throws an ApiError built from the error envelope on a non-2xx response', async () => {
    server.use(
      http.put(`${BASE_URL}/api/v1/agents/a1`, () =>
        HttpResponse.json(
          {
            error: {
              code: ERROR_CODES.NOT_FOUND,
              message: 'Agent not found',
              requestId: 'req_9',
              details: [],
            },
          },
          { status: 404 },
        ),
      ),
    )

    const error = await client.put('/agents/a1', {}).catch((caught: unknown) => caught)

    expect(error).toBeInstanceOf(ApiError)
    expect(error).toMatchObject({ status: 404, code: ERROR_CODES.NOT_FOUND, requestId: 'req_9' })
  })

  it('throws UNKNOWN_ERROR when a failed response is not JSON', async () => {
    server.use(
      http.get(`${BASE_URL}/api/v1/agents`, () => new HttpResponse('Bad gateway', { status: 502 })),
    )

    const error = await client.get('/agents').catch((caught: unknown) => caught)

    expect(error).toMatchObject({ status: 502, code: CLIENT_ERROR_CODES.UNKNOWN_ERROR })
  })

  it('throws NETWORK_ERROR when the request never reaches the API', async () => {
    server.use(http.get(`${BASE_URL}/api/v1/agents`, () => HttpResponse.error()))

    const error = await client.get('/agents').catch((caught: unknown) => caught)

    expect(error).toBeInstanceOf(ApiError)
    expect(error).toMatchObject({ status: 0, code: CLIENT_ERROR_CODES.NETWORK_ERROR })
  })
})
