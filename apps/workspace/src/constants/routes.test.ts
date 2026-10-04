// SPDX-License-Identifier: AGPL-3.0-only
import { NextRequest } from 'next/server'
import { describe, expect, it } from 'vitest'

import { createSessionProxy } from '@surefy/web-core/auth/proxy'

import { PUBLIC_PATHS, ROUTES, SETTINGS_SECTION } from './routes'

const ORIGIN = 'http://app.surefyos.test'
// The same options as `src/proxy.ts`
const proxy = createSessionProxy({ loginPath: ROUTES.auth.login, publicPaths: PUBLIC_PATHS })

function request(path: string, sessionCookie = false) {
  const headers = sessionCookie ? { cookie: 'better-auth.session_token=abc.def' } : undefined
  return new NextRequest(new URL(path, ORIGIN), { headers })
}

describe('ROUTES', () => {
  it('builds organization paths from the slug and the optional segments', () => {
    const { workspace } = ROUTES

    expect(workspace.home('acme')).toBe('/acme/chat')
    expect(workspace.chat('acme')).toBe('/acme/chat')
    expect(workspace.chat('acme', 'c1')).toBe('/acme/chat/c1')
    expect(workspace.agent('acme', 'a1', 'tools')).toBe('/acme/agents/a1/tools')
    expect(workspace.knowledgeBase('acme', 'kb1')).toBe('/acme/knowledge/kb1')
    expect(workspace.run('acme', 'r1')).toBe('/acme/insights/runs/r1')
    expect(workspace.approval('acme', 'p1')).toBe('/acme/insights/approvals/p1')
    expect(workspace.settings('acme')).toBe('/acme/settings')
    expect(workspace.settings('acme', SETTINGS_SECTION.LICENSE)).toBe('/acme/settings/license')
    expect(workspace.vault('acme', 'fallback')).toBe('/acme/settings/vault/fallback')
    expect(workspace.profile('acme')).toBe('/acme/profile')
  })

  it('builds invitation links under the public invite prefix', () => {
    expect(ROUTES.auth.invite('tok_1')).toBe('/invite/tok_1')
  })
})

describe('session proxy with the workspace paths', () => {
  it.each([
    ROUTES.auth.login,
    ROUTES.auth.signup,
    ROUTES.auth.verifyEmail,
    ROUTES.auth.twoFactor,
    ROUTES.auth.twoFactorSetup,
    ROUTES.auth.forgotPassword,
    ROUTES.auth.resetPassword,
    ROUTES.auth.setup,
    ROUTES.auth.invite('tok_1'),
  ])('lets %s through without a session', (path) => {
    expect(proxy(request(path)).headers.get('location')).toBeNull()
  })

  it.each([
    ROUTES.root,
    ROUTES.auth.organizations,
    ROUTES.auth.noOrganization,
    ROUTES.workspace.home('acme'),
    ROUTES.workspace.settings('acme', SETTINGS_SECTION.MEMBERS),
  ])('sends %s to the login page without a session', (path) => {
    const location = new URL(proxy(request(path)).headers.get('location') ?? '', ORIGIN)

    expect(location.pathname).toBe(ROUTES.auth.login)
    expect(location.searchParams.get('redirect')).toBe(path)
  })

  it('lets organization pages through with a session cookie', () => {
    expect(proxy(request(ROUTES.workspace.home('acme'), true)).headers.get('location')).toBeNull()
  })

  it('does not treat a path that only starts like a public one as public', () => {
    expect(proxy(request('/login-history')).headers.get('location')).not.toBeNull()
  })
})
