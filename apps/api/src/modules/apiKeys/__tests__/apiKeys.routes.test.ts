// SPDX-License-Identifier: AGPL-3.0-only
import { and, eq } from 'drizzle-orm'
import { describe, expect, it, vi } from 'vitest'

import { apiKeys, auditLogs, organizations } from '@/database/tables/index.js'
import {
  apiKeyCreatedDtoSchema,
  apiKeyDtoSchema,
  apiKeyImpactDtoSchema,
  API_KEY_SECRET_PATTERN,
  ERROR_CODES,
  isApiKeyScopeAllowed,
  MODULES,
  PERMISSIONS,
  ROLE_PERMISSIONS,
} from '@surefy/contracts'

import { seedApiKey } from '../../../../test/factories/index.js'
import { setupTwoOrgs, type TwoOrgSetup } from '../../../../test/helpers/orgSetup.js'
import { expectData, expectError, expectPage, request } from '../../../../test/helpers/request.js'
import { hashApiKey } from '../apiKeys.utils.js'

import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'

const keysUrl = (orgId: string, path = '') => `/api/v1/orgs/${orgId}/api-keys${path}`
const DAY_MS = 86_400_000

type Who = 'olivia' | 'adam' | 'uma'

const call = (
  setup: TwoOrgSetup,
  who: Who,
  method: 'GET' | 'POST' | 'PATCH',
  path: string,
  payload?: unknown,
  query?: Record<string, string>,
) =>
  request(setup.app, method, keysUrl(setup.a.id, path), {
    headers: setup.sessionOf(setup.a.members[who]),
    ...(payload === undefined ? {} : { payload }),
    ...(query === undefined ? {} : { query }),
  })

const createKey = async (setup: TwoOrgSetup, extra: Record<string, unknown> = {}) =>
  expectData(
    await call(setup, 'adam', 'POST', '', {
      name: 'Website backend',
      scopes: [PERMISSIONS.AGENTS_INVOKE],
      ...extra,
    }),
    201,
    apiKeyCreatedDtoSchema,
  )

const rowOf = async (setup: TwoOrgSetup, keyId: string) => {
  const [row] = await setup.db.tenant(setup.a.id, (tx) =>
    tx.select().from(apiKeys).where(eq(apiKeys.id, keyId)),
  )
  return row
}

const auditActions = async (setup: TwoOrgSetup, action: string) =>
  setup.db.system('test', (tx) =>
    tx
      .select()
      .from(auditLogs)
      .where(and(eq(auditLogs.organizationId, setup.a.id), eq(auditLogs.action, action))),
  )

/** A route a key can reach: it needs `agents:invoke`, as the agent run endpoints will. */
const probe: FastifyPluginAsyncZod = (app) => {
  app.get(
    '/orgs/:orgId/key-probe',
    { preHandler: app.authorize(PERMISSIONS.AGENTS_INVOKE), schema: { hide: true } },
    (incoming, reply) => {
      void reply.send({ data: { via: incoming.tenant.via, role: incoming.tenant.role } })
    },
  )
  return Promise.resolve()
}

describe('creating a key', () => {
  it('returns the full key once, and keeps only its hash', async () => {
    const setup = await setupTwoOrgs()
    const { apiKey, secret } = await createKey(setup, {
      expiresAt: new Date(Date.now() + 30 * DAY_MS).toISOString(),
    })
    expect(secret).toMatch(API_KEY_SECRET_PATTERN)
    expect(apiKey).toMatchObject({
      name: 'Website backend',
      scopes: [PERMISSIONS.AGENTS_INVOKE],
      status: 'active',
      isExpired: false,
      lastUsedAt: null,
      createdBy: { id: setup.a.members.adam.id },
      keyPrefix: secret.slice(0, 11),
    })

    const row = await rowOf(setup, apiKey.id)
    expect(row?.keyHash?.equals(hashApiKey(secret))).toBe(true)
    expect(JSON.stringify(row)).not.toContain(secret)

    // listing and reading show the start of the key only
    const read = expectData(await call(setup, 'adam', 'GET', `/${apiKey.id}`), 200, apiKeyDtoSchema)
    expect(JSON.stringify(read)).not.toContain(secret)
    const listed = expectPage(await call(setup, 'adam', 'GET', ''), apiKeyDtoSchema)
    expect(JSON.stringify(listed.data)).not.toContain(secret)

    // the audit entry says what the key may do, never the key
    const entries = await auditActions(setup, 'api_key.created')
    expect(entries).toHaveLength(1)
    expect(JSON.stringify(entries)).not.toContain(secret)
    expect(JSON.stringify(entries)).not.toContain(apiKey.keyPrefix)
    expect(JSON.stringify(entries)).toContain(PERMISSIONS.AGENTS_INVOKE)
  })

  it('lets only Admins and Owners manage keys', async () => {
    const setup = await setupTwoOrgs()
    expectError(
      await call(setup, 'uma', 'POST', '', { name: 'x', scopes: [PERMISSIONS.AGENTS_INVOKE] }),
      403,
      ERROR_CODES.ACCESS_FORBIDDEN,
    )
    expectError(await call(setup, 'uma', 'GET', ''), 403, ERROR_CODES.ACCESS_FORBIDDEN)
    const owner = await call(setup, 'olivia', 'GET', '')
    expect(owner.statusCode).toBe(200)
  })

  it('asks for a recent sign-in and creates nothing without one', async () => {
    const setup = await setupTwoOrgs()
    // the session was created now; twenty minutes later it is older than the fresh age
    vi.useFakeTimers({ toFake: ['Date'], now: Date.now() + 20 * 60_000 })
    try {
      expectError(
        await call(setup, 'adam', 'POST', '', {
          name: 'Late',
          scopes: [PERMISSIONS.AGENTS_INVOKE],
        }),
        403,
        ERROR_CODES.AUTH_SESSION_NOT_FRESH,
      )
      const rows = await setup.db.tenant(setup.a.id, (tx) => tx.select().from(apiKeys))
      expect(rows).toHaveLength(0)
      // reading is not sensitive
      expect((await call(setup, 'adam', 'GET', '')).statusCode).toBe(200)
    } finally {
      vi.useRealTimers()
    }
  })

  it('refuses permissions that are unknown, that keys cannot carry, or that the creator lacks', async () => {
    const setup = await setupTwoOrgs()
    expectError(
      await call(setup, 'adam', 'POST', '', { name: 'x', scopes: ['made:up'] }),
      422,
      ERROR_CODES.API_KEY_SCOPE_NOT_ALLOWED,
    )
    expectError(
      await call(setup, 'adam', 'POST', '', { name: 'x', scopes: [PERMISSIONS.API_KEYS_MANAGE] }),
      422,
      ERROR_CODES.API_KEY_SCOPE_NOT_ALLOWED,
    )
    // a permission the Admin does not hold: a key never carries more than its creator
    const notHeld = Object.values(PERMISSIONS).find(
      (permission) =>
        isApiKeyScopeAllowed(permission) &&
        !(ROLE_PERMISSIONS.admin as readonly string[]).includes(permission),
    )
    if (notHeld === undefined) throw new Error('every permission is held by an Admin')
    const error = expectError(
      await call(setup, 'adam', 'POST', '', { name: 'x', scopes: [notHeld] }),
      422,
      ERROR_CODES.ACCESS_EXCEEDS_PARENT,
    )
    expect(JSON.stringify(error.details)).toContain(notHeld)
  })

  it('validates the body and refuses an expiry in the past', async () => {
    const setup = await setupTwoOrgs()
    expectError(
      await call(setup, 'adam', 'POST', '', { name: '', scopes: [PERMISSIONS.AGENTS_INVOKE] }),
      422,
      ERROR_CODES.VALIDATION_FAILED,
    )
    expectError(
      await call(setup, 'adam', 'POST', '', { name: 'x', scopes: [] }),
      422,
      ERROR_CODES.VALIDATION_FAILED,
    )
    expectError(
      await call(setup, 'adam', 'POST', '', {
        name: 'x',
        scopes: [PERMISSIONS.AGENTS_INVOKE],
        expiresAt: new Date(Date.now() - DAY_MS).toISOString(),
      }),
      422,
      ERROR_CODES.API_KEY_EXPIRY_INVALID,
    )
  })
})

describe('listing, renaming and revoking', () => {
  it('lists newest first, filters by status and name, and pages', async () => {
    const setup = await setupTwoOrgs()
    const first = await createKey(setup, { name: 'Alpha' })
    const second = await createKey(setup, { name: 'Beta' })
    await createKey(setup, { name: 'Gamma' })
    expectData(
      await call(setup, 'adam', 'POST', `/${first.apiKey.id}/revoke`),
      200,
      apiKeyDtoSchema,
    )

    const all = expectPage(await call(setup, 'adam', 'GET', ''), apiKeyDtoSchema)
    expect(all.data.map((key) => key.name)).toEqual(['Gamma', 'Beta', 'Alpha'])

    const active = expectPage(
      await call(setup, 'adam', 'GET', '', undefined, { status: 'active' }),
      apiKeyDtoSchema,
    )
    expect(active.data.map((key) => key.name)).toEqual(['Gamma', 'Beta'])
    const revoked = expectPage(
      await call(setup, 'adam', 'GET', '', undefined, { status: 'revoked' }),
      apiKeyDtoSchema,
    )
    expect(revoked.data.map((key) => key.id)).toEqual([first.apiKey.id])

    const found = expectPage(
      await call(setup, 'adam', 'GET', '', undefined, { q: 'bet' }),
      apiKeyDtoSchema,
    )
    expect(found.data.map((key) => key.id)).toEqual([second.apiKey.id])

    const byName = expectPage(
      await call(setup, 'adam', 'GET', '', undefined, { sort: 'name' }),
      apiKeyDtoSchema,
    )
    expect(byName.data.map((key) => key.name)).toEqual(['Alpha', 'Beta', 'Gamma'])

    const page1 = expectPage(
      await call(setup, 'adam', 'GET', '', undefined, { limit: '2', sort: 'lastUsedAt' }),
      apiKeyDtoSchema,
    )
    expect(page1.data).toHaveLength(2)
    expect(page1.nextCursor).not.toBeNull()
    const page2 = expectPage(
      await call(setup, 'adam', 'GET', '', undefined, {
        limit: '2',
        sort: 'lastUsedAt',
        cursor: page1.nextCursor ?? '',
      }),
      apiKeyDtoSchema,
    )
    expect(page2.data).toHaveLength(1)
    expect(page2.nextCursor).toBeNull()
  })

  it('computes expiry from the date and keeps an expired key active', async () => {
    const setup = await setupTwoOrgs()
    const expired = await seedApiKey(setup.container, setup.a.id, {
      name: 'Old script',
      expiresAt: new Date(Date.now() - DAY_MS),
    })
    const key = expectData(await call(setup, 'adam', 'GET', `/${expired.id}`), 200, apiKeyDtoSchema)
    expect(key).toMatchObject({ status: 'active', isExpired: true })
  })

  it('renames a key, audits it, and refuses a revoked one', async () => {
    const setup = await setupTwoOrgs()
    const { apiKey } = await createKey(setup)
    const renamed = expectData(
      await call(setup, 'adam', 'PATCH', `/${apiKey.id}`, { name: 'Zapier' }),
      200,
      apiKeyDtoSchema,
    )
    expect(renamed.name).toBe('Zapier')
    const entries = await auditActions(setup, 'api_key.updated')
    expect(entries).toHaveLength(1)
    expect(JSON.stringify(entries)).toContain('Website backend')

    expectData(await call(setup, 'adam', 'POST', `/${apiKey.id}/revoke`), 200, apiKeyDtoSchema)
    expectError(
      await call(setup, 'adam', 'PATCH', `/${apiKey.id}`, { name: 'Again' }),
      409,
      ERROR_CODES.API_KEY_REVOKED,
    )
  })

  it('revokes at once: the hash goes, the row stays, a second revoke conflicts', async () => {
    const setup = await setupTwoOrgs({ routes: [probe] })
    const { apiKey, secret } = await createKey(setup)
    const revoked = expectData(
      await call(setup, 'olivia', 'POST', `/${apiKey.id}/revoke`),
      200,
      apiKeyDtoSchema,
    )
    expect(revoked).toMatchObject({
      status: 'revoked',
      revokedBy: { id: setup.a.members.olivia.id },
    })
    expect(revoked.revokedAt).not.toBeNull()
    const row = await rowOf(setup, apiKey.id)
    expect(row?.keyHash).toBeNull()
    expect(row?.status).toBe('revoked')
    expect(await auditActions(setup, 'api_key.revoked')).toHaveLength(1)
    expectError(
      await call(setup, 'olivia', 'POST', `/${apiKey.id}/revoke`),
      409,
      ERROR_CODES.API_KEY_REVOKED,
    )
    // and the key no longer signs anything in
    const response = await request(setup.app, 'GET', `/api/v1/orgs/${setup.a.id}/key-probe`, {
      headers: { authorization: `Bearer ${secret}` },
    })
    expect(response.statusCode).toBe(401)
  })

  it('answers the impact of a key, and 404 for a key of another organization', async () => {
    const setup = await setupTwoOrgs()
    const { apiKey } = await createKey(setup)
    const impact = expectData(
      await call(setup, 'adam', 'GET', `/${apiKey.id}/impact`),
      200,
      apiKeyImpactDtoSchema,
    )
    expect(impact).toEqual({ dependents: [], listed: [] })

    const other = await seedApiKey(setup.container, setup.b.id)
    expectError(
      await call(setup, 'adam', 'GET', `/${other.id}/impact`),
      404,
      ERROR_CODES.API_KEY_NOT_FOUND,
    )
    expectError(
      await call(setup, 'adam', 'POST', `/${other.id}/revoke`),
      404,
      ERROR_CODES.API_KEY_NOT_FOUND,
    )
  })
})

describe('authenticating with a key', () => {
  const probeUrl = (setup: TwoOrgSetup) => `/api/v1/orgs/${setup.a.id}/key-probe`

  it('signs in with the organization level only: no role, no person', async () => {
    const setup = await setupTwoOrgs({ routes: [probe] })
    const key = await seedApiKey(setup.container, setup.a.id)
    const response = await request(setup.app, 'GET', probeUrl(setup), { headers: key.headers })
    expect(response.statusCode, response.body).toBe(200)
    expect(response.json<{ data: unknown }>().data).toEqual({ via: 'api-key', role: null })
  })

  it('accepts a key only on the public API host', async () => {
    const setup = await setupTwoOrgs({ routes: [probe] })
    const key = await seedApiKey(setup.container, setup.a.id)
    const response = await request(setup.app, 'GET', probeUrl(setup), {
      headers: { authorization: key.headers.authorization ?? '', host: 'app.example.test' },
    })
    expectError(response, 401, ERROR_CODES.AUTH_UNAUTHENTICATED)
  })

  it('answers 401 alike for an unknown, a malformed, a revoked and an expired key', async () => {
    const setup = await setupTwoOrgs({ routes: [probe] })
    const revoked = await seedApiKey(setup.container, setup.a.id, { status: 'revoked' })
    const expired = await seedApiKey(setup.container, setup.a.id, {
      expiresAt: new Date(Date.now() - 1000),
    })
    const unknown = await seedApiKey(setup.container, setup.a.id)
    await setup.db.tenant(setup.a.id, (tx) => tx.delete(apiKeys).where(eq(apiKeys.id, unknown.id)))
    for (const headers of [
      revoked.headers,
      expired.headers,
      unknown.headers,
      { ...revoked.headers, authorization: 'Bearer sk_tooshort' },
    ]) {
      expectError(
        await request(setup.app, 'GET', probeUrl(setup), { headers }),
        401,
        ERROR_CODES.AUTH_UNAUTHENTICATED,
      )
    }
  })

  it('stops resolving when the organization is suspended', async () => {
    const setup = await setupTwoOrgs({ routes: [probe] })
    const key = await seedApiKey(setup.container, setup.a.id)
    await setup.db.system('test', (tx) =>
      tx.update(organizations).set({ status: 'suspended' }).where(eq(organizations.id, setup.a.id)),
    )
    expectError(
      await request(setup.app, 'GET', probeUrl(setup), { headers: key.headers }),
      401,
      ERROR_CODES.AUTH_UNAUTHENTICATED,
    )
  })

  it('keeps a key inside its organization and inside its scopes', async () => {
    const setup = await setupTwoOrgs({ routes: [probe] })
    const key = await seedApiKey(setup.container, setup.a.id)
    // another organization's path: not found
    expectError(
      await request(setup.app, 'GET', `/api/v1/orgs/${setup.b.id}/key-probe`, {
        headers: key.headers,
      }),
      404,
      ERROR_CODES.ORGANIZATION_NOT_FOUND,
    )
    // a route outside its scopes: forbidden; a key can never manage keys
    expectError(
      await request(setup.app, 'GET', keysUrl(setup.a.id), { headers: key.headers }),
      403,
      ERROR_CODES.ACCESS_FORBIDDEN,
    )
    expectError(
      await request(setup.app, 'POST', keysUrl(setup.a.id), {
        headers: key.headers,
        payload: { name: 'Mine', scopes: [PERMISSIONS.AGENTS_INVOKE] },
      }),
      403,
      ERROR_CODES.ACCESS_FORBIDDEN,
    )
    // and never a person's own routes
    expect(
      (await request(setup.app, 'GET', '/api/v1/me', { headers: key.headers })).statusCode,
    ).toBe(403)
  })

  it('cuts the scopes down to what the organization enables', async () => {
    const setup = await setupTwoOrgs({ routes: [probe] })
    // the Owner restricts the organization: agents are off
    const policy = await request(setup.app, 'PUT', `/api/v1/orgs/${setup.a.id}/access/policy`, {
      headers: setup.sessionOf(setup.a.members.olivia),
      payload: { version: 1, modules: MODULES.filter((module) => module !== 'agents') },
    })
    expect(policy.statusCode, policy.body).toBe(200)
    const key = await seedApiKey(setup.container, setup.a.id)
    expectError(
      await request(setup.app, 'GET', probeUrl(setup), { headers: key.headers }),
      403,
      ERROR_CODES.ACCESS_FORBIDDEN,
    )
  })
})

describe('last use and retention', () => {
  it('writes the buffered use of a key when the job runs', async () => {
    const setup = await setupTwoOrgs({ routes: [probe] })
    const key = await seedApiKey(setup.container, setup.a.id)
    const first = await request(setup.app, 'GET', `/api/v1/orgs/${setup.a.id}/key-probe`, {
      headers: key.headers,
    })
    expect(first.statusCode).toBe(200)
    expect((await rowOf(setup, key.id))?.lastUsedAt).toBeNull() // buffered, not written yet

    await flushUntilWritten(setup, key.id)
    const row = await rowOf(setup, key.id)
    expect(row?.lastUsedAt).toBeInstanceOf(Date)
    expect(row?.lastUsedIp).not.toBeNull()
  })

  it('deletes revoked keys only after 13 months', async () => {
    const setup = await setupTwoOrgs()
    const old = await seedApiKey(setup.container, setup.a.id, { status: 'revoked' })
    const recent = await seedApiKey(setup.container, setup.a.id, { status: 'revoked' })
    const active = await seedApiKey(setup.container, setup.a.id)
    await setup.db.tenant(setup.a.id, async (tx) => {
      await tx
        .update(apiKeys)
        .set({ revokedAt: new Date(Date.now() - 14 * 31 * DAY_MS) })
        .where(eq(apiKeys.id, old.id))
      await tx
        .update(apiKeys)
        .set({ revokedAt: new Date(Date.now() - 12 * 30 * DAY_MS) })
        .where(eq(apiKeys.id, recent.id))
    })
    const deleted = await setup.container.modules.apiKeys.maintenance.deleteExpiredRevoked()
    expect(deleted).toBe(1)
    expect(await rowOf(setup, old.id)).toBeUndefined()
    expect(await rowOf(setup, recent.id)).toBeDefined()
    expect(await rowOf(setup, active.id)).toBeDefined()
  })
})

/** The use is noted in the background (`void record(…)`), so flush until it shows up. */
async function flushUntilWritten(setup: TwoOrgSetup, keyId: string): Promise<void> {
  const deadline = Date.now() + 5000
  for (;;) {
    await setup.container.modules.apiKeys.lastUsed.flush()
    if ((await rowOf(setup, keyId))?.lastUsedAt != null || Date.now() > deadline) return
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
}
