// SPDX-License-Identifier: AGPL-3.0-only
import { sql } from 'drizzle-orm'
import { afterEach, describe, expect, it } from 'vitest'

import { installAdmins, installSettings, users } from '@/database/tables/index.js'
import {
  ERROR_CODES,
  meDtoSchema,
  organizationDtoSchema,
  setupChecklistDtoSchema,
  setupResultDtoSchema,
  setupStatusDtoSchema,
} from '@surefy/contracts'

import { testPassword } from '../../../../test/factories/index.js'
import { cookiesOf, SESSION_COOKIE, TEST_APP_ORIGIN } from '../../../../test/helpers/auth.js'
import { setupTwoOrgs as setupTwoOrgsApp } from '../../../../test/helpers/orgSetup.js'
import {
  expectData,
  expectError,
  expectNoContent,
  request,
} from '../../../../test/helpers/request.js'
import {
  createTestApp as createTestAppBase,
  type TestAppOptions,
} from '../../../../test/helpers/testApp.js'

import type { FastifyInstance, LightMyRequestResponse } from 'fastify'

// Each test closes its app, so the parallel test files stay under the database's connection limit.
const opened: (() => Promise<void>)[] = []
afterEach(async () => {
  await Promise.all(opened.splice(0).map((close) => close()))
})
const createTestApp = async (options?: TestAppOptions) => {
  const testApp = await createTestAppBase(options)
  opened.push(() => testApp.close())
  return testApp
}
const setupTwoOrgs = async () => {
  const context = await setupTwoOrgsApp()
  opened.push(() => context.close())
  return context
}

const SETUP_TOKEN = 'setup-token-for-tests-0001'

const setupInput = (overrides: Record<string, unknown> = {}) => ({
  organization: { name: 'Acme Research', slug: 'acme', timezone: 'Europe/Berlin' },
  owner: { name: 'Olivia Owner', email: 'Olivia@Example.TEST', password: testPassword(1) },
  locale: 'en',
  ...overrides,
})

/** `POST /setup` through the workspace's host, as the browser sends it. */
const postSetup = (app: FastifyInstance, payload: unknown): Promise<LightMyRequestResponse> =>
  app.inject({
    method: 'POST',
    url: '/api/v1/setup',
    headers: { host: new URL(TEST_APP_ORIGIN).host, origin: TEST_APP_ORIGIN },
    payload: payload as Record<string, unknown>,
  })

const sessionCookie = (response: LightMyRequestResponse): Record<string, string> => {
  const token = cookiesOf(response.headers['set-cookie']).get(SESSION_COOKIE)
  if (token === undefined) throw new Error('no session cookie')
  return { cookie: `${SESSION_COOKIE}=${token}` }
}

describe('GET /setup/status', () => {
  it('reports an open setup with the server check on a fresh install', async () => {
    const { app } = await createTestApp()
    const status = expectData(
      await request(app, 'GET', '/api/v1/setup/status'),
      200,
      setupStatusDtoSchema,
    )
    expect(status).toMatchObject({ isComplete: false, finishedAt: null, requiresToken: false })
    expect(status.checks.map((check) => [check.key, check.status])).toEqual([
      ['server', 'ok'],
      ['database', 'ok'],
      ['storage', 'ok'],
      ['email', 'warning'],
      ['gpu', 'warning'],
    ])
    expect(status.checks.find((check) => check.key === 'email')?.code).toBe('EMAIL_NOT_CONFIGURED')
  })

  it('says a token is required when SETUP_TOKEN is set', async () => {
    const { app } = await createTestApp({ env: { SETUP_TOKEN } })
    const status = expectData(
      await request(app, 'GET', '/api/v1/setup/status'),
      200,
      setupStatusDtoSchema,
    )
    expect(status.requiresToken).toBe(true)
  })

  it('is complete, without the server check, once an organization exists', async () => {
    const { app } = await setupTwoOrgs()
    const status = expectData(
      await request(app, 'GET', '/api/v1/setup/status'),
      200,
      setupStatusDtoSchema,
    )
    expect(status).toMatchObject({ isComplete: true, checks: [] })
  })
})

describe('POST /setup', () => {
  it('creates the Owner, organization and first install administrator and signs in', async () => {
    const { app, db } = await createTestApp()
    const response = await postSetup(app, setupInput())
    const result = expectData(response, 201, setupResultDtoSchema)
    expect(result.organization).toMatchObject({ name: 'Acme Research', slug: 'acme' })
    expect(result.user).toMatchObject({ email: 'olivia@example.test', emailVerified: true })

    const headers = sessionCookie(response)
    const me = expectData(await request(app, 'GET', '/api/v1/me', { headers }), 200, meDtoSchema)
    expect(me.isInstallAdmin).toBe(true)
    expect(me.memberships).toEqual([
      expect.objectContaining({
        organization: expect.objectContaining({ id: result.organization.id }) as unknown,
        role: 'owner',
      }),
    ])
    expect(me.preferences).toMatchObject({
      locale: 'en',
      lastOrganizationId: result.organization.id,
    })
    const organization = expectData(
      await request(app, 'GET', `/api/v1/orgs/${result.organization.id}`, { headers }),
      200,
      organizationDtoSchema,
    )
    expect(organization).toMatchObject({ timezone: 'Europe/Berlin', defaultLocale: 'en' })
    const admins = await db.global.select().from(installAdmins)
    expect(admins).toEqual([expect.objectContaining({ userId: result.user.id })])
  })

  it('is refused once an organization exists', async () => {
    const { app } = await createTestApp()
    expectData(await postSetup(app, setupInput()), 201, setupResultDtoSchema)
    const again = await postSetup(
      app,
      setupInput({
        organization: { name: 'Second', slug: 'second' },
        owner: { name: 'Mallory', email: 'mallory@example.test', password: testPassword(2) },
      }),
    )
    expectError(again, 409, ERROR_CODES.SETUP_ALREADY_COMPLETED)
    const status = expectData(
      await request(app, 'GET', '/api/v1/setup/status'),
      200,
      setupStatusDtoSchema,
    )
    expect(status.isComplete).toBe(true)
  })

  it('lets one of two concurrent setups win', async () => {
    const { app, db } = await createTestApp()
    const [first, second] = await Promise.all([
      postSetup(app, setupInput()),
      postSetup(
        app,
        setupInput({
          organization: { name: 'Beta', slug: 'beta' },
          owner: { name: 'Bea', email: 'bea@example.test', password: testPassword(3) },
        }),
      ),
    ])
    expect([first.statusCode, second.statusCode].sort((x, y) => x - y)).toEqual([201, 409])
    const count = await db.global.execute<{ count: number }>(
      sql`select install_organization_count() as count`,
    )
    expect(count.rows[0]?.count).toBe(1)
    // The loser's account is deleted again.
    expect(await db.global.select({ id: users.id }).from(users)).toHaveLength(1)
  })

  it('requires the setup token when SETUP_TOKEN is set', async () => {
    const { app } = await createTestApp({ env: { SETUP_TOKEN } })
    expectError(await postSetup(app, setupInput()), 403, ERROR_CODES.SETUP_TOKEN_INVALID)
    expectError(
      await postSetup(app, setupInput({ token: `${SETUP_TOKEN}-wrong` })),
      403,
      ERROR_CODES.SETUP_TOKEN_INVALID,
    )
    expectData(await postSetup(app, setupInput({ token: SETUP_TOKEN })), 201, setupResultDtoSchema)
  })

  it('deletes the new account when the organization cannot be created', async () => {
    const { app, db } = await createTestApp()
    const response = await postSetup(
      app,
      setupInput({ organization: { name: 'Admin', slug: 'admin' } }),
    )
    expectError(response, 409, ERROR_CODES.ORGANIZATION_SLUG_RESERVED)
    expect(await db.global.select({ id: users.id }).from(users)).toEqual([])
  })

  it('refuses an unknown time zone before creating anything', async () => {
    const { app, db } = await createTestApp()
    const response = await postSetup(
      app,
      setupInput({ organization: { name: 'Acme', slug: 'acme', timezone: 'Mars/Olympus' } }),
    )
    expectError(response, 422, ERROR_CODES.VALIDATION_FAILED)
    expect(await db.global.select({ id: users.id }).from(users)).toEqual([])
  })
})

describe('POST /orgs/:orgId/setup/complete', () => {
  it('records the skipped steps and when setup was finished', async () => {
    const { app, db } = await createTestApp()
    const response = await postSetup(app, setupInput())
    const { organization } = expectData(response, 201, setupResultDtoSchema)
    const headers = sessionCookie(response)
    expectNoContent(
      await request(app, 'POST', `/api/v1/orgs/${organization.id}/setup/complete`, {
        headers,
        payload: { skippedSteps: ['model'] },
      }),
    )
    const updated = expectData(
      await request(app, 'GET', `/api/v1/orgs/${organization.id}`, { headers }),
      200,
      organizationDtoSchema,
    )
    expect(updated.settings.setup.skippedSteps).toEqual(['model'])
    const [row] = await db.global.select().from(installSettings)
    expect(row?.setupCompletedAt).toBeInstanceOf(Date)
    const status = expectData(
      await request(app, 'GET', '/api/v1/setup/status'),
      200,
      setupStatusDtoSchema,
    )
    expect(status.finishedAt).toBe(row?.setupCompletedAt?.toISOString())
  })

  it('is for members who manage settings', async () => {
    const { app, a, sessionOf } = await setupTwoOrgs()
    expectError(
      await request(app, 'POST', `/api/v1/orgs/${a.id}/setup/complete`, {
        headers: sessionOf(a.members.uma),
        payload: {},
      }),
      403,
      ERROR_CODES.ACCESS_FORBIDDEN,
    )
  })
})

describe('GET /orgs/:orgId/setup/checklist', () => {
  it('offers inviting the team until someone else joined or was invited', async () => {
    const { app } = await createTestApp()
    const response = await postSetup(app, setupInput())
    const { organization } = expectData(response, 201, setupResultDtoSchema)
    const headers = sessionCookie(response)
    const url = `/api/v1/orgs/${organization.id}/setup/checklist`
    const before = expectData(
      await request(app, 'GET', url, { headers }),
      200,
      setupChecklistDtoSchema,
    )
    expect(before).toEqual({ items: [{ key: 'invite-team', done: false }], dismissed: false })

    await request(app, 'POST', `/api/v1/orgs/${organization.id}/invitations`, {
      headers,
      payload: { email: 'new.person@example.test', role: 'user' },
    })
    await request(app, 'PATCH', `/api/v1/orgs/${organization.id}/members/me/preferences`, {
      headers,
      payload: { checklistDismissed: true },
    })
    const after = expectData(
      await request(app, 'GET', url, { headers }),
      200,
      setupChecklistDtoSchema,
    )
    expect(after).toEqual({ items: [{ key: 'invite-team', done: true }], dismissed: true })
  })

  it('is done for an organization with several members', async () => {
    const { app, a, sessionOf } = await setupTwoOrgs()
    const checklist = expectData(
      await request(app, 'GET', `/api/v1/orgs/${a.id}/setup/checklist`, {
        headers: sessionOf(a.members.uma),
      }),
      200,
      setupChecklistDtoSchema,
    )
    expect(checklist.items).toEqual([{ key: 'invite-team', done: true }])
  })
})
