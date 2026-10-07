// SPDX-License-Identifier: AGPL-3.0-only
// @vitest-environment node
import { http } from 'msw'
import { setupServer } from 'msw/node'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { meFactory } from '../testing/fixtures/identity'
import { mockError, mockOk } from '../testing/mock'

const INTERNAL_API_URL = 'https://api.internal'
const ME_URL = `${INTERNAL_API_URL}/api/v1/me`
const server = setupServer()

vi.mock('next/headers', () => ({
  cookies: () => Promise.resolve({ toString: () => 'surefy.session_token=t' }),
  headers: () => Promise.resolve(new Headers({ host: 'app.surefyos.test' })),
}))
vi.mock('next/navigation', () => ({
  redirect: (path: string) => {
    throw new Error(`redirect:${path}`)
  },
}))

beforeAll(() => {
  server.listen({ onUnhandledFrame: 'error' })
})
beforeEach(() => {
  vi.stubEnv('INTERNAL_API_URL', INTERNAL_API_URL)
})
afterEach(() => {
  server.resetHandlers()
  vi.unstubAllEnvs()
})
afterAll(() => {
  server.close()
})

describe('getSession', () => {
  it('returns the signed-in person from the API', async () => {
    const me = meFactory()
    server.use(http.get(ME_URL, () => mockOk(me)))
    const { getSession } = await import('./server')

    await expect(getSession()).resolves.toEqual(me)
  })

  it('returns null without a valid session', async () => {
    server.use(http.get(ME_URL, () => mockError(401, 'AUTH_UNAUTHENTICATED', 'Sign in')))
    const { getSession } = await import('./server')

    await expect(getSession()).resolves.toBeNull()
  })

  it('throws when the API is broken, so the error boundary shows instead of the login page', async () => {
    server.use(http.get(ME_URL, () => mockError(500, 'INTERNAL_ERROR', 'Boom')))
    const { getSession } = await import('./server')

    await expect(getSession()).rejects.toMatchObject({ code: 'INTERNAL_ERROR' })
  })
})

describe('requireSession', () => {
  it('returns the session when there is one', async () => {
    const me = meFactory()
    server.use(http.get(ME_URL, () => mockOk(me)))
    const { requireSession } = await import('./server')

    await expect(requireSession('/login')).resolves.toEqual(me)
  })

  it('redirects to the login page without a session', async () => {
    server.use(http.get(ME_URL, () => mockError(401, 'AUTH_UNAUTHENTICATED', 'Sign in')))
    const { requireSession } = await import('./server')

    await expect(requireSession('/login')).rejects.toThrow('redirect:/login')
  })
})
