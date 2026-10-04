// SPDX-License-Identifier: AGPL-3.0-only
// @vitest-environment node
import { HttpResponse, http } from 'msw'
import { setupServer } from 'msw/node'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const INTERNAL_API_URL = 'https://api.internal'
const server = setupServer()

vi.mock('next/headers', () => ({
  cookies: () => Promise.resolve({ toString: () => 'sid=abc; theme=dark' }),
  headers: () => Promise.resolve(new Headers({ host: 'app.surefyos.test' })),
}))

beforeAll(() => {
  server.listen({ onUnhandledFrame: 'error' })
})
beforeEach(() => {
  // `serverEnv` is parsed when the module loads, so every test starts from a fresh module graph.
  vi.resetModules()
  vi.unstubAllEnvs()
})
afterEach(() => {
  server.resetHandlers()
})
afterAll(() => {
  server.close()
})

describe('getServerHttpClient', () => {
  it('calls the internal API URL and forwards the request cookies and host', async () => {
    vi.stubEnv('INTERNAL_API_URL', INTERNAL_API_URL)
    let received: Record<string, string | null> = {}
    server.use(
      http.get(`${INTERNAL_API_URL}/api/v1/me`, ({ request }) => {
        received = {
          cookie: request.headers.get('cookie'),
          forwardedHost: request.headers.get('x-forwarded-host'),
        }
        return HttpResponse.json({ data: { id: 'u1' } })
      }),
    )
    const { getServerHttpClient } = await import('./server')

    const client = await getServerHttpClient()
    await expect(client.get('/me')).resolves.toEqual({ id: 'u1' })

    expect(received).toEqual({ cookie: 'sid=abc; theme=dark', forwardedHost: 'app.surefyos.test' })
  })

  it('fails at load time when INTERNAL_API_URL is missing or invalid', async () => {
    vi.stubEnv('INTERNAL_API_URL', 'not a url')

    await expect(import('./server')).rejects.toThrow(/INTERNAL_API_URL/)
  })
})
