// SPDX-License-Identifier: AGPL-3.0-only
// @vitest-environment node
import { NextRequest } from 'next/server'
import { describe, expect, it } from 'vitest'

import { createSessionProxy } from './createSessionProxy'

const ORIGIN = 'https://app.surefyos.test'
const SESSION_COOKIE = 'better-auth.session_token=token.signature'

const proxy = createSessionProxy({ loginPath: '/login', publicPaths: ['/login', '/invite'] })

function request(path: string, cookie?: string): NextRequest {
  return new NextRequest(`${ORIGIN}${path}`, { headers: cookie ? { cookie } : {} })
}

function isPassedThrough(response: Response): boolean {
  return response.headers.get('x-middleware-next') === '1'
}

describe('createSessionProxy', () => {
  it('lets a request with this app’s session cookie through', () => {
    expect(isPassedThrough(proxy(request('/acme/agents', SESSION_COOKIE)))).toBe(true)
  })

  it('lets public paths and everything below them through without a session', () => {
    expect(isPassedThrough(proxy(request('/login')))).toBe(true)
    expect(isPassedThrough(proxy(request('/invite/abc123')))).toBe(true)
  })

  it('does not treat a path that only starts like a public one as public', () => {
    expect(isPassedThrough(proxy(request('/login-help')))).toBe(false)
  })

  it('sends a request without a session to the login page with where it was going', () => {
    const response = proxy(request('/acme/agents?tab=runs'))

    const location = new URL(response.headers.get('location') ?? '')
    expect(response.status).toBe(307)
    expect(location.origin).toBe(ORIGIN)
    expect(location.pathname).toBe('/login')
    expect(location.searchParams.get('redirect')).toBe('/acme/agents?tab=runs')
  })
})
