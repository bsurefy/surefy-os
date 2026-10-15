// SPDX-License-Identifier: AGPL-3.0-only
/* eslint-disable sonarjs/no-clear-text-protocols -- SearXNG runs on the customer's own network, over http */
import { eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'

import { vaultCredentials } from '@/database/tables/index.js'
import { VaultSearchService } from '@/modules/vault/vaultSearch.service.js'
import {
  connectionTestDtoSchema,
  credentialDtoSchema,
  ERROR_CODES,
  searchProviderSettingsDtoSchema,
} from '@surefy/contracts'

import { setupTwoOrgs, type TwoOrgSetup } from '../../../../test/helpers/orgSetup.js'
import { expectData, expectError, request } from '../../../../test/helpers/request.js'

const BRAVE_KEY = 'test-brave-key-0001'
const TAVILY_KEY = 'test-tavily-key-0002'
const SEARXNG_URL = 'http://searxng:8080'
const vaultUrl = (orgId: string, path = '') => `/api/v1/orgs/${orgId}/vault${path}`

type Who = 'olivia' | 'adam' | 'uma'

const call = (
  setup: TwoOrgSetup,
  who: Who,
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
  path: string,
  payload?: unknown,
) =>
  request(setup.app, method, vaultUrl(setup.a.id, path), {
    headers: setup.sessionOf(setup.a.members[who]),
    ...(payload === undefined ? {} : { payload }),
  })

const addProvider = async (setup: TwoOrgSetup, body: Record<string, unknown>) =>
  expectData(await call(setup, 'adam', 'POST', '/search-providers', body), 201, credentialDtoSchema)

const settings = async (setup: TwoOrgSetup, who: Who = 'adam') =>
  expectData(
    await call(setup, who, 'GET', '/search-providers'),
    200,
    searchProviderSettingsDtoSchema,
  )

describe('search providers', () => {
  it('stores a key only after its test passes, encrypted, and makes the first one primary', async () => {
    const setup = await setupTwoOrgs()
    expect(await settings(setup)).toEqual({ providers: [], active: null })

    const brave = await addProvider(setup, {
      providerKey: 'brave',
      name: 'Brave Search',
      secret: BRAVE_KEY,
    })
    expect(brave).toMatchObject({
      kind: 'search_provider',
      providerKey: 'brave',
      scope: 'organization',
      isPrimary: true,
      status: 'active',
      secretLast4: '0001',
      baseUrl: null,
    })
    expect(JSON.stringify(brave)).not.toContain(BRAVE_KEY)
    // the test asked Brave for one result with the key in its header
    const test = setup.search.calls.at(-1)
    expect(test?.url.hostname).toBe('api.search.brave.com')
    expect(test?.url.searchParams.get('count')).toBe('1')
    expect(test?.headers.get('x-subscription-token')).toBe(BRAVE_KEY)

    const [row] = await setup.db.tenant(setup.a.id, (tx) =>
      tx.select().from(vaultCredentials).where(eq(vaultCredentials.id, brave.id)),
    )
    expect(row?.secretCiphertext?.toString('utf8')).not.toContain(BRAVE_KEY)

    expect(await settings(setup)).toMatchObject({
      providers: [{ id: brave.id }],
      active: { providerKey: 'brave', source: 'vault', credentialId: brave.id },
    })
    // only people who manage the vault add providers
    expectError(
      await call(setup, 'uma', 'POST', '/search-providers', {
        providerKey: 'brave',
        name: 'Mine',
        secret: BRAVE_KEY,
      }),
      403,
      ERROR_CODES.ACCESS_FORBIDDEN,
    )
  })

  it('refuses a key the provider rejects, and stores nothing', async () => {
    const setup = await setupTwoOrgs()
    setup.search.setMode({ kind: 'status', status: 401 })
    expectError(
      await call(setup, 'adam', 'POST', '/search-providers', {
        providerKey: 'tavily',
        name: 'Tavily',
        secret: TAVILY_KEY,
      }),
      422,
      ERROR_CODES.VAULT_KEY_INVALID,
    )
    setup.search.setMode({ kind: 'status', status: 429 })
    expectError(
      await call(setup, 'adam', 'POST', '/search-providers', {
        providerKey: 'tavily',
        name: 'Tavily',
        secret: TAVILY_KEY,
      }),
      422,
      ERROR_CODES.VAULT_QUOTA_EXCEEDED,
    )
    setup.search.setMode({ kind: 'offline' })
    expectError(
      await call(setup, 'adam', 'POST', '/search-providers', {
        providerKey: 'searxng',
        name: 'Metasearch',
        baseUrl: SEARXNG_URL,
      }),
      422,
      ERROR_CODES.LOCAL_SERVER_UNREACHABLE,
    )
    expect(await settings(setup)).toEqual({ providers: [], active: null })
  })

  it('keeps one primary: a second provider waits until it is switched in, and a revoke hands over', async () => {
    const setup = await setupTwoOrgs()
    const brave = await addProvider(setup, {
      providerKey: 'brave',
      name: 'Brave Search',
      secret: BRAVE_KEY,
    })
    const searxng = await addProvider(setup, {
      providerKey: 'searxng',
      name: 'Metasearch',
      baseUrl: SEARXNG_URL,
    })
    expect(searxng).toMatchObject({ isPrimary: false, baseUrl: SEARXNG_URL, secretLast4: null })
    expect((await settings(setup)).active?.providerKey).toBe('brave')

    const switched = expectData(
      await call(setup, 'adam', 'POST', `/credentials/${searxng.id}/make-primary`),
      200,
      credentialDtoSchema,
    )
    expect(switched.isPrimary).toBe(true)
    const after = await settings(setup)
    expect(after.active).toEqual({
      providerKey: 'searxng',
      source: 'vault',
      credentialId: searxng.id,
    })
    expect(after.providers.map((p) => [p.id, p.isPrimary])).toEqual([
      [searxng.id, true],
      [brave.id, false],
    ])

    // revoking the primary one leaves no provider until another is switched in
    expectData(
      await call(setup, 'adam', 'POST', `/credentials/${searxng.id}/revoke`),
      200,
      credentialDtoSchema,
    )
    expect(await settings(setup)).toMatchObject({ providers: [{ id: brave.id }], active: null })
    expectData(
      await call(setup, 'adam', 'POST', `/credentials/${brave.id}/make-primary`),
      200,
      credentialDtoSchema,
    )
    expect((await settings(setup)).active?.credentialId).toBe(brave.id)
  })

  it('tests a provider before it is saved and again after, recording its health', async () => {
    const setup = await setupTwoOrgs()
    const connection = expectData(
      await call(setup, 'adam', 'POST', '/connection-tests', {
        kind: 'search_provider',
        providerKey: 'tavily',
        secret: TAVILY_KEY,
      }),
      200,
      connectionTestDtoSchema,
    )
    expect(connection).toMatchObject({ ok: true, models: [], reasonCode: null, duplicateOf: null })
    const tavily = await addProvider(setup, {
      providerKey: 'tavily',
      name: 'Tavily',
      secret: TAVILY_KEY,
    })
    // the same key again is a warning on the test, not an error
    const again = expectData(
      await call(setup, 'adam', 'POST', '/connection-tests', {
        kind: 'search_provider',
        providerKey: 'tavily',
        secret: TAVILY_KEY,
      }),
      200,
      connectionTestDtoSchema,
    )
    expect(again.duplicateOf).toEqual({ id: tavily.id, name: 'Tavily' })

    setup.search.setMode({ kind: 'status', status: 429 })
    const failed = expectData(
      await call(setup, 'adam', 'POST', `/credentials/${tavily.id}/test`),
      200,
      connectionTestDtoSchema,
    )
    expect(failed).toMatchObject({ ok: false, reasonCode: ERROR_CODES.VAULT_QUOTA_EXCEEDED })
    expect(
      expectData(
        await call(setup, 'adam', 'GET', `/credentials/${tavily.id}`),
        200,
        credentialDtoSchema,
      ),
    ).toMatchObject({ status: 'rate_limited', statusReasonCode: 'VAULT_QUOTA_EXCEEDED' })

    setup.search.setMode({ kind: 'ok' })
    await call(setup, 'adam', 'POST', `/credentials/${tavily.id}/test`)
    expect(
      expectData(
        await call(setup, 'adam', 'GET', `/credentials/${tavily.id}`),
        200,
        credentialDtoSchema,
      ).status,
    ).toBe('active')
    // a plain test of a SearXNG address needs the address, not a key
    expectError(
      await call(setup, 'adam', 'POST', '/connection-tests', {
        kind: 'search_provider',
        providerKey: 'searxng',
      }),
      422,
      ERROR_CODES.VALIDATION_FAILED,
    )
  })

  it('resolves the provider: the stored primary, else the install SearXNG address, else none', async () => {
    const setup = await setupTwoOrgs()
    const vault = setup.container.modules.vault
    const withInstall = (searxngUrl: string | null) =>
      new VaultSearchService({
        db: setup.db,
        secrets: vault.crypto.secrets,
        providers: setup.search.providers,
        vaultRepository: vault.repository,
        users: { findUserRefs: () => Promise.resolve(new Map()) },
        usage: {
          spendThisMonth: () => Promise.resolve(new Map()),
          usersThisMonth: () => Promise.resolve(0),
        },
        install: { searxngUrl: () => Promise.resolve(searxngUrl) },
        audit: setup.container.modules.audit.service,
        logger: setup.container.logger,
      })

    expect(await vault.search.resolve(setup.a.id)).toBeNull()
    expect(await withInstall(SEARXNG_URL).resolve(setup.a.id)).toEqual({
      providerKey: 'searxng',
      credentials: { baseUrl: SEARXNG_URL },
      credentialId: null,
      source: 'install',
    })

    const brave = await addProvider(setup, {
      providerKey: 'brave',
      name: 'Brave Search',
      secret: BRAVE_KEY,
    })
    // a stored provider wins over the install's address, and arrives with its decrypted key
    expect(await withInstall(SEARXNG_URL).resolve(setup.a.id)).toEqual({
      providerKey: 'brave',
      credentials: { apiKey: BRAVE_KEY },
      credentialId: brave.id,
      source: 'vault',
    })
    // another organization sees none of it
    expect(await vault.search.resolve(setup.b.id)).toBeNull()

    // an expired key is not used
    await setup.db.tenant(setup.a.id, (tx) =>
      tx
        .update(vaultCredentials)
        .set({ status: 'expired' })
        .where(eq(vaultCredentials.id, brave.id)),
    )
    expect(await withInstall(null).resolve(setup.a.id)).toBeNull()
  })

  it('records health after a search: rate limited, then active again', async () => {
    const setup = await setupTwoOrgs()
    const vault = setup.container.modules.vault
    const tavily = await addProvider(setup, {
      providerKey: 'tavily',
      name: 'Tavily',
      secret: TAVILY_KEY,
    })
    await vault.search.recordHealth(setup.a.id, tavily.id, {
      ok: false,
      reasonCode: 'VAULT_QUOTA_EXCEEDED',
    })
    expect(
      expectData(
        await call(setup, 'adam', 'GET', `/credentials/${tavily.id}`),
        200,
        credentialDtoSchema,
      ),
    ).toMatchObject({ status: 'rate_limited' })
    await vault.search.recordHealth(setup.a.id, tavily.id, { ok: true })
    const healthy = expectData(
      await call(setup, 'adam', 'GET', `/credentials/${tavily.id}`),
      200,
      credentialDtoSchema,
    )
    expect(healthy.status).toBe('active')
    expect(healthy.lastUsedAt).not.toBeNull()
  })
})
