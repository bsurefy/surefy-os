// SPDX-License-Identifier: AGPL-3.0-only
import { eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'

import { sessions, userPreferences, users } from '@/database/tables/index.js'
import { COMMUNITY_INSTALL_CAPABILITIES } from '@/modules/access/index.js'
import {
  ERROR_CODES,
  meDtoSchema,
  revokeOtherSessionsResultDtoSchema,
  sessionDtoSchema,
  signInOptionsDtoSchema,
} from '@surefy/contracts'

import { authPost, queuedEmails, secretOf, totp } from './authTestKit.js'
import { createTestUser, newId, testPassword } from '../../../../test/factories/index.js'
import {
  authHeaders,
  cookiesOf,
  SESSION_COOKIE,
  TEST_APP_ORIGIN,
} from '../../../../test/helpers/auth.js'
import { expectData, expectError, request } from '../../../../test/helpers/request.js'
import { createTestApp } from '../../../../test/helpers/testApp.js'
import { getTestDatabase } from '../../../../test/helpers/testDatabase.js'

const UUID_V7 = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

const setup = async (env: Record<string, string> = {}) => {
  const testApp = await createTestApp({ env })
  const maya = await createTestUser(testApp.container, { name: 'Maya Okafor' })
  return { ...testApp, maya }
}

describe('GET /me', () => {
  it('returns the person, default preferences, the session and the Community install', async () => {
    const { app, maya } = await setup()
    const me = expectData(
      await request(app, 'GET', '/api/v1/me', { headers: await authHeaders(app, maya) }),
      200,
      meDtoSchema,
    )
    expect(me.user).toMatchObject({
      id: maya.id,
      name: 'Maya Okafor',
      email: maya.email,
      emailVerified: true,
      imageUrl: null,
      twoFactorEnabled: false,
    })
    expect(me.user.id).toMatch(UUID_V7)
    expect(me.preferences).toEqual({
      locale: null,
      theme: 'system',
      timezone: null,
      lastOrganizationId: null,
    })
    expect(me.session).toMatchObject({ app: 'workspace' })
    expect(me.session.id).toMatch(UUID_V7)
    expect(me).toMatchObject({
      memberships: [],
      platform: null,
      partners: [],
      supportAccess: [],
      isInstallAdmin: false,
      canCreateOrganization: false,
      install: COMMUNITY_INSTALL_CAPABILITIES,
    })
  })

  it('needs a session: none, a forged cookie or an API key', async () => {
    const { app } = await setup()
    expectError(await request(app, 'GET', '/api/v1/me'), 401, ERROR_CODES.AUTH_UNAUTHENTICATED)
    expectError(
      await request(app, 'GET', '/api/v1/me', { headers: { cookie: `${SESSION_COOKIE}=forged` } }),
      401,
      ERROR_CODES.AUTH_UNAUTHENTICATED,
    )
    expectError(
      await request(app, 'GET', '/api/v1/me', { headers: { authorization: 'Bearer sk_test_1' } }),
      401,
      ERROR_CODES.AUTH_UNAUTHENTICATED,
    )
  })

  it('records the app of the origin the person signed in through', async () => {
    const { app, maya } = await setup({ CONSOLE_ORIGIN: 'http://console.localhost:3001' })
    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/sign-in/email',
      headers: { host: 'console.localhost:3001', origin: 'http://console.localhost:3001' },
      payload: { email: maya.email, password: maya.password },
    })
    expect(response.statusCode).toBe(200)
    const token = cookiesOf(response.headers['set-cookie']).get(SESSION_COOKIE) ?? ''
    const me = expectData(
      await request(app, 'GET', '/api/v1/me', {
        headers: { cookie: `${SESSION_COOKIE}=${token}` },
      }),
      200,
      meDtoSchema,
    )
    expect(me.session.app).toBe('console')
  })
})

describe('PATCH /me', () => {
  it('updates the name and the preferences, creating the row on the first write', async () => {
    const { app, maya, db } = await setup()
    const headers = await authHeaders(app, maya)
    const me = expectData(
      await request(app, 'PATCH', '/api/v1/me', {
        headers,
        payload: { name: '  Maya O.  ', theme: 'dark', locale: 'en', timezone: 'Europe/Berlin' },
      }),
      200,
      meDtoSchema,
    )
    expect(me.user.name).toBe('Maya O.')
    expect(me.preferences).toEqual({
      locale: 'en',
      theme: 'dark',
      timezone: 'Europe/Berlin',
      lastOrganizationId: null,
    })
    const again = expectData(
      await request(app, 'PATCH', '/api/v1/me', { headers, payload: { timezone: null } }),
      200,
      meDtoSchema,
    )
    expect(again.preferences).toMatchObject({ theme: 'dark', timezone: null })
    const rows = await db.user(maya.id, (tx) => tx.select().from(userPreferences))
    expect(rows).toHaveLength(1)
  })

  it('rejects invalid values and an organization the person is not in', async () => {
    const { app, maya } = await setup()
    const headers = await authHeaders(app, maya)
    expectError(
      await request(app, 'PATCH', '/api/v1/me', { headers, payload: { theme: 'neon' } }),
      422,
      ERROR_CODES.VALIDATION_FAILED,
    )
    expectError(
      await request(app, 'PATCH', '/api/v1/me', {
        headers,
        payload: { lastOrganizationId: newId() },
      }),
      404,
      ERROR_CODES.ORGANIZATION_NOT_FOUND,
    )
    expectError(
      await request(app, 'PATCH', '/api/v1/me', { payload: { theme: 'dark' } }),
      401,
      ERROR_CODES.AUTH_UNAUTHENTICATED,
    )
  })
})

describe('/me/sessions', () => {
  const sessionList = z.array(sessionDtoSchema)

  it('lists the active sessions, marking the current one', async () => {
    const { app, maya } = await setup()
    const laptop = await authHeaders(app, maya)
    await authHeaders(app, maya) // a second device
    const list = expectData(
      await request(app, 'GET', '/api/v1/me/sessions', { headers: laptop }),
      200,
      sessionList,
    )
    expect(list).toHaveLength(2)
    expect(list.filter((s) => s.isCurrent)).toHaveLength(1)
    expect(list.every((s) => s.app === 'workspace')).toBe(true)
  })

  it('ends one session; it stops working at once', async () => {
    const { app, maya } = await setup()
    const laptop = await authHeaders(app, maya)
    const phone = await authHeaders(app, maya)
    const list = expectData(
      await request(app, 'GET', '/api/v1/me/sessions', { headers: laptop }),
      200,
      sessionList,
    )
    const phoneSession = list.find((s) => !s.isCurrent)
    const response = await request(app, 'DELETE', `/api/v1/me/sessions/${phoneSession?.id}`, {
      headers: laptop,
    })
    expect(response.statusCode).toBe(204)
    expectError(
      await request(app, 'GET', '/api/v1/me', { headers: phone }),
      401,
      ERROR_CODES.AUTH_UNAUTHENTICATED,
    )
    expect((await request(app, 'GET', '/api/v1/me', { headers: laptop })).statusCode).toBe(200)
  })

  it("answers 404 for another person's session and an unknown id", async () => {
    const { app, maya, container } = await setup()
    const omar = await createTestUser(container)
    await authHeaders(app, omar)
    const [omarSession] = await getTestDatabase()
      .db.global.select({ id: sessions.id })
      .from(sessions)
      .where(eq(sessions.userId, omar.id))
    const headers = await authHeaders(app, maya)
    for (const id of [omarSession?.id ?? '', newId()]) {
      expectError(
        await request(app, 'DELETE', `/api/v1/me/sessions/${id}`, { headers }),
        404,
        ERROR_CODES.AUTH_SESSION_NOT_FOUND,
      )
    }
    expectError(
      await request(app, 'DELETE', '/api/v1/me/sessions/not-a-uuid', { headers }),
      422,
      ERROR_CODES.VALIDATION_FAILED,
    )
  })

  it('signs out everywhere else', async () => {
    const { app, maya, container } = await setup()
    const laptop = await authHeaders(app, maya)
    const phone = await authHeaders(app, maya)
    const tablet = await authHeaders(app, maya)
    const omar = await createTestUser(container)
    const omarHeaders = await authHeaders(app, omar)
    const result = expectData(
      await request(app, 'POST', '/api/v1/me/sessions/revoke-others', { headers: laptop }),
      200,
      revokeOtherSessionsResultDtoSchema,
    )
    expect(result).toEqual({ revoked: 2 })
    for (const headers of [phone, tablet]) {
      expectError(
        await request(app, 'GET', '/api/v1/me', { headers }),
        401,
        ERROR_CODES.AUTH_UNAUTHENTICATED,
      )
    }
    expect((await request(app, 'GET', '/api/v1/me', { headers: laptop })).statusCode).toBe(200)
    expect((await request(app, 'GET', '/api/v1/me', { headers: omarHeaders })).statusCode).toBe(200)
  })
})

describe('GET /auth/options', () => {
  it('is public and lists only the configured OAuth providers', async () => {
    const { app } = await setup({
      OAUTH_GITHUB_CLIENT_ID: 'github-client',
      OAUTH_GITHUB_CLIENT_SECRET: 'github-secret',
    })
    const options = expectData(
      await request(app, 'GET', '/api/v1/auth/options'),
      200,
      signInOptionsDtoSchema,
    )
    expect(options).toMatchObject({
      emailPassword: true,
      oauthProviders: ['github'],
      signupOpen: false,
    })
  })
})

describe('Better Auth under /api/auth', () => {
  it('keeps public sign-up closed by default (invitation only)', async () => {
    const { app, db } = await setup()
    const response = await authPost(app, '/sign-up/email', {
      name: 'Stranger',
      email: 'stranger@example.test',
      password: testPassword(900),
    })
    // Better Auth answers a refused sign-up like an existing account, so neither is revealed.
    expect(cookiesOf(response.headers['set-cookie']).get(SESSION_COOKIE)).toBeUndefined()
    const rows = await db.global
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, 'stranger@example.test'))
    expect(rows).toEqual([])
  })

  it('stores emails lowercase and queues the verification email with an app link', async () => {
    const { container, app } = await setup()
    const person = await createTestUser(container, {
      email: 'Bea.Example@Example.TEST',
      emailVerified: false,
    })
    expect(person.email).toBe('bea.example@example.test')
    const emails = await queuedEmails(container)
    const verify = emails.find((e) => e.template === 'verifyEmail' && e.to === person.email)
    // Created by server code (no request): the link falls back to the public API URL.
    expect(verify?.url.startsWith('http://localhost:4000/api/auth/verify-email?')).toBe(true)
    // Not verified yet: no session.
    const signIn = await authPost(app, '/sign-in/email', {
      email: person.email,
      password: person.password,
    })
    expect(signIn.statusCode).toBe(403)
  })

  it('queues a password reset with a link on the workspace origin', async () => {
    const { container, app, maya } = await setup()
    const response = await authPost(app, '/request-password-reset', {
      email: maya.email,
      redirectTo: `${TEST_APP_ORIGIN}/reset-password`,
    })
    expect(response.statusCode).toBe(200)
    const reset = (await queuedEmails(container)).find((e) => e.template === 'passwordReset')
    expect(reset).toMatchObject({ to: maya.email })
    expect(reset?.url.startsWith(`${TEST_APP_ORIGIN}/api/auth/reset-password/`)).toBe(true)
  })

  it('gives a disabled person no session', async () => {
    const { app, maya, db } = await setup()
    await db.global
      .update(users)
      .set({ disabledAt: new Date(), disabledReason: 'security_lock' })
      .where(eq(users.id, maya.id))
    const response = await authPost(app, '/sign-in/email', {
      email: maya.email,
      password: maya.password,
    })
    expect(response.statusCode).not.toBe(200)
    expect(cookiesOf(response.headers['set-cookie']).get(SESSION_COOKIE)).toBeUndefined()
  })

  it('signs in with two-factor once it is enabled', async () => {
    const { app, maya } = await setup()
    const headers = await authHeaders(app, maya)
    const enabled = await authPost(app, '/two-factor/enable', { password: maya.password }, headers)
    expect(enabled.statusCode).toBe(200)
    const secret = secretOf(enabled.json<{ totpURI: string }>().totpURI)
    const verified = await authPost(app, '/two-factor/verify-totp', { code: totp(secret) }, headers)
    expect(verified.statusCode).toBe(200)

    const first = await authPost(app, '/sign-in/email', {
      email: maya.email,
      password: maya.password,
    })
    expect(first.json()).toMatchObject({ twoFactorRedirect: true })
    const pending = cookiesOf(first.headers['set-cookie'])
    expect(pending.get(SESSION_COOKIE) ?? '').toBe('')
    const cookie = [...pending]
      .filter(([, value]) => value !== '')
      .map(([name, value]) => `${name}=${value}`)
      .join('; ')
    const second = await authPost(
      app,
      '/two-factor/verify-totp',
      { code: totp(secret) },
      { cookie },
    )
    expect(second.statusCode).toBe(200)
    const token = cookiesOf(second.headers['set-cookie']).get(SESSION_COOKIE) ?? ''
    const me = expectData(
      await request(app, 'GET', '/api/v1/me', {
        headers: { cookie: `${SESSION_COOKIE}=${token}` },
      }),
      200,
      meDtoSchema,
    )
    expect(me.user.twoFactorEnabled).toBe(true)
  })
})

describe('user_preferences (RLS family self)', () => {
  it("shows and writes only the person's own row under db.user", async () => {
    const { container, maya, db } = await setup()
    const omar = await createTestUser(container)
    await db.system('test', (tx) =>
      tx.insert(userPreferences).values([{ userId: maya.id }, { userId: omar.id, theme: 'dark' }]),
    )
    const visible = await db.user(maya.id, (tx) => tx.select().from(userPreferences))
    expect(visible.map((row) => row.userId)).toEqual([maya.id])
    await expect(
      db.user(maya.id, (tx) =>
        tx
          .update(userPreferences)
          .set({ theme: 'light' })
          .where(eq(userPreferences.userId, omar.id)),
      ),
    ).resolves.toBeDefined()
    const [omars] = await db.user(omar.id, (tx) => tx.select().from(userPreferences))
    expect(omars?.theme).toBe('dark')
    await expect(
      db.user(maya.id, (tx) => tx.insert(userPreferences).values({ userId: newId() })),
    ).rejects.toThrow()
    const none = await db.global.select().from(userPreferences)
    expect(none).toEqual([])
  })
})
