// SPDX-License-Identifier: AGPL-3.0-only
import { and, eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'

import { auditLogs, connections, outboxEvents } from '@/database/tables/index.js'
import {
  connectionCheckDtoSchema,
  connectionDtoSchema,
  connectionImpactDtoSchema,
  connectionProviderDtoSchema,
  CONNECTIONS_ERROR_CODES,
  ERROR_CODES,
} from '@surefy/contracts'

import { OutboundError } from '../connectionsHttp.js'
import {
  setupConnections,
  stubCustomApi,
  stubWhatsApp,
  type ConnectionsSetup,
} from './connectionsTestKit.js'
import { expectData, expectError, expectPage } from '../../../../test/helpers/request.js'

const KEY = 'sk-live-secretvalue-a4f2'
const HOST = 'api.acme.test'

const customApi = (extra: Record<string, unknown> = {}) => ({
  providerKey: 'http',
  authType: 'api_key',
  secret: KEY,
  baseUrl: `https://${HOST}`,
  name: 'Acme API',
  scope: 'organization',
  ...extra,
})

const whatsapp = (extra: Record<string, unknown> = {}) => ({
  providerKey: 'whatsapp',
  authType: 'bearer',
  secret: 'test-whatsapp-whatsapp-token',
  extra: { phoneNumberId: '105500112233', appSecret: 'meta-app-secret' },
  scope: 'personal',
  ...extra,
})

const rowOf = async (setup: ConnectionsSetup, id: string) => {
  const [row] = await setup.db.tenant(setup.a.id, (tx) =>
    tx.select().from(connections).where(eq(connections.id, id)),
  )
  return row
}

const auditActions = async (setup: ConnectionsSetup, action: string) =>
  setup.db.system('test', (tx) =>
    tx
      .select()
      .from(auditLogs)
      .where(and(eq(auditLogs.organizationId, setup.a.id), eq(auditLogs.action, action))),
  )

const addCustomApi = async (setup: ConnectionsSetup, who: 'adam' | 'bella' = 'adam', extra = {}) =>
  expectData(await setup.call(who, 'POST', '', customApi(extra)), 201, connectionDtoSchema)

describe('adding a connection', () => {
  it('stores the secret encrypted after the check passed, and never returns it', async () => {
    const setup = await setupConnections()
    stubCustomApi(setup.http, HOST)
    const connection = await addCustomApi(setup)
    expect(connection).toMatchObject({
      providerKey: 'http',
      kind: 'api_tool',
      authType: 'api_key',
      name: 'Acme API',
      scope: 'organization',
      baseUrl: `https://${HOST}`,
      secretLast4: 'a4f2',
      status: 'active',
      statusReasonCode: null,
      usedByCount: 0,
      connectedBy: { id: setup.a.members.adam.id },
    })
    // the check called the address with the key before anything was stored
    const [call] = setup.http.callsTo(HOST)
    expect(call?.kind).toBe('external')
    expect(call?.request.headers?.authorization).toBe(`Bearer ${KEY}`)

    const row = await rowOf(setup, connection.id)
    expect(row?.secretCiphertext?.toString('utf8')).not.toContain(KEY)
    expect(row?.dataKeyVersion).toBe(1)
    expect(row?.secretLast4).toBe('a4f2')

    const listed = expectPage(await setup.call('adam', 'GET', ''), connectionDtoSchema)
    expect(JSON.stringify(listed.data)).not.toContain(KEY)
    const read = await setup.call('adam', 'GET', `/${connection.id}`)
    expect(read.body).not.toContain(KEY)

    // the audit entry names the connection, never a secret or its last characters
    const entries = await auditActions(setup, 'connection.created')
    expect(entries).toHaveLength(1)
    const text = JSON.stringify(entries)
    expect(text).not.toContain(KEY)
    expect(text).not.toContain('a4f2')
    expect(text).toContain('"http"')
  })

  it('stores nothing when the check fails and says why', async () => {
    const setup = await setupConnections()
    stubCustomApi(setup.http, HOST, 401)
    expectError(
      await setup.call('adam', 'POST', '', customApi()),
      422,
      CONNECTIONS_ERROR_CODES.CONNECTION_PROVIDER_REJECTED,
    )
    setup.http.reset()
    setup.http.on(HOST, new OutboundError('unreachable', 'connection refused'))
    expectError(
      await setup.call('adam', 'POST', '', customApi()),
      422,
      CONNECTIONS_ERROR_CODES.CONNECTION_UNREACHABLE,
    )
    setup.http.reset()
    setup.http.on(HOST, new OutboundError('unsafe', 'private address'))
    expectError(
      await setup.call('adam', 'POST', '', customApi()),
      422,
      CONNECTIONS_ERROR_CODES.CONNECTION_BASE_URL_NOT_ALLOWED,
    )
    const rows = await setup.db.tenant(setup.a.id, (tx) => tx.select().from(connections))
    expect(rows).toEqual([])
    expect(await auditActions(setup, 'connection.created')).toEqual([])
  })

  it('accepts plain http only for hosts on the install list', async () => {
    const strict = await setupConnections()
    stubCustomApi(strict.http, 'localhost')
    expectError(
      await strict.call('adam', 'POST', '', customApi({ baseUrl: 'http://localhost:8080' })),
      422,
      CONNECTIONS_ERROR_CODES.CONNECTION_BASE_URL_NOT_ALLOWED,
    )
    expect(strict.http.callsTo('localhost')).toEqual([])

    const lenient = await setupConnections({ env: { CONNECTIONS_LOCAL_HOSTS: 'localhost' } })
    stubCustomApi(lenient.http, 'localhost')
    const connection = expectData(
      await lenient.call('adam', 'POST', '', customApi({ baseUrl: 'http://localhost:8080' })),
      201,
      connectionDtoSchema,
    )
    expect(connection.baseUrl).toBe('http://localhost:8080')
  })

  it('refuses apps, ways of signing in and fields the registry does not know', async () => {
    const setup = await setupConnections()
    expectError(
      await setup.call('adam', 'POST', '', customApi({ providerKey: 'acme-billing' })),
      422,
      CONNECTIONS_ERROR_CODES.CONNECTION_PROVIDER_UNSUPPORTED,
    )
    expectError(
      await setup.call('adam', 'POST', '', whatsapp({ providerKey: 'slack' })),
      422,
      CONNECTIONS_ERROR_CODES.CONNECTION_AUTH_TYPE_UNSUPPORTED,
    )
    // a self-hosted app needs its address; an app with its own address refuses one
    const withoutAddress: Record<string, unknown> = customApi()
    delete withoutAddress.baseUrl
    expectError(
      await setup.call('adam', 'POST', '', withoutAddress),
      422,
      ERROR_CODES.VALIDATION_FAILED,
    )
    expectError(
      await setup.call('bella', 'POST', '', whatsapp({ baseUrl: 'https://example.test' })),
      422,
      ERROR_CODES.VALIDATION_FAILED,
    )
    expectError(
      await setup.call('bella', 'POST', '', whatsapp({ extra: {} })),
      422,
      ERROR_CODES.VALIDATION_FAILED,
    )
  })

  it('lets Builders add their own connections and Admins add team and organization ones', async () => {
    const setup = await setupConnections()
    stubWhatsApp(setup.http)
    stubCustomApi(setup.http, HOST)
    const teamId = await setup.addTeam('Support', [setup.builders.bella])

    const mine = expectData(
      await setup.call('bella', 'POST', '', whatsapp()),
      201,
      connectionDtoSchema,
    )
    expect(mine).toMatchObject({
      scope: 'personal',
      owner: { id: setup.builders.bella.id },
      team: null,
      externalAccountLabel: 'Acme Support (+1 555 0100)',
    })

    for (const scope of ['organization', 'team'] as const) {
      expectError(
        await setup.call(
          'bella',
          'POST',
          '',
          customApi({ scope, teamId: scope === 'team' ? teamId : undefined }),
        ),
        403,
        ERROR_CODES.ACCESS_FORBIDDEN,
      )
    }
    const shared = expectData(
      await setup.call('adam', 'POST', '', customApi({ scope: 'team', teamId })),
      201,
      connectionDtoSchema,
    )
    expect(shared).toMatchObject({ scope: 'team', team: { id: teamId }, owner: null })
    expectError(
      await setup.call(
        'adam',
        'POST',
        '',
        customApi({ scope: 'team', teamId: '0198a000-0000-7000-8000-0000000000aa' }),
      ),
      404,
      ERROR_CODES.TEAM_NOT_FOUND,
    )
    // a User cannot reach the module at all
    expectError(await setup.call('uma', 'GET', ''), 403, ERROR_CODES.ACCESS_FORBIDDEN)
  })

  it('does not add the same account twice in one scope', async () => {
    const setup = await setupConnections()
    stubWhatsApp(setup.http)
    const first = expectData(
      await setup.call('bella', 'POST', '', whatsapp()),
      201,
      connectionDtoSchema,
    )
    const duplicate = expectError(
      await setup.call('bella', 'POST', '', whatsapp({ name: 'Again' })),
      409,
      CONNECTIONS_ERROR_CODES.CONNECTION_DUPLICATE,
    )
    expect(JSON.stringify(duplicate.details)).toContain(first.id)
    // another person, or another scope, is another connection
    expectData(await setup.call('ben', 'POST', '', whatsapp()), 201, connectionDtoSchema)
    expectData(
      await setup.call('adam', 'POST', '', whatsapp({ scope: 'organization' })),
      201,
      connectionDtoSchema,
    )
  })

  it('signs in with client credentials and keeps the client for renewing the token', async () => {
    const setup = await setupConnections()
    stubCustomApi(setup.http, HOST)
    setup.http.on('auth.acme.test/token', {
      body: { access_token: 'cc-token-1', expires_in: 3600, scope: 'read write' },
    })
    const connection = expectData(
      await setup.call('adam', 'POST', '', {
        providerKey: 'http',
        authType: 'oauth2',
        tokenUrl: 'https://auth.acme.test/token',
        clientId: 'client-1',
        clientSecret: 'client-secret-1',
        oauthScopes: ['read', 'write'],
        baseUrl: `https://${HOST}`,
        scope: 'organization',
      }),
      201,
      connectionDtoSchema,
    )
    expect(connection).toMatchObject({
      authType: 'oauth2',
      secretLast4: null,
      oauthScopes: ['read', 'write'],
    })
    expect(connection.tokenExpiresAt).not.toBeNull()
    const [tokenCall] = setup.http.callsTo('auth.acme.test')
    expect(tokenCall?.request.headers?.authorization).toMatch(/^Basic /)
    expect(tokenCall?.request.body).toContain('grant_type=client_credentials')
    expect(setup.http.callsTo(HOST)[0]?.request.headers?.authorization).toBe('Bearer cc-token-1')
    expect(JSON.stringify(connection)).not.toContain('client-secret-1')
  })

  it('adds an open endpoint without a secret', async () => {
    const setup = await setupConnections()
    stubCustomApi(setup.http, HOST)
    const connection = expectData(
      await setup.call('adam', 'POST', '', {
        providerKey: 'mcp',
        authType: 'none',
        baseUrl: `https://${HOST}/mcp`,
        scope: 'organization',
      }),
      201,
      connectionDtoSchema,
    )
    expect(connection).toMatchObject({ authType: 'none', name: HOST, secretLast4: null })
    const row = await rowOf(setup, connection.id)
    expect(row?.secretCiphertext).toBeNull()
    expect(setup.http.callsTo(HOST)[0]?.request.headers?.authorization).toBeUndefined()
  })
})

describe('who sees which connections', () => {
  it('shows Builders their own, and Admins and Owners everything without values', async () => {
    const setup = await setupConnections()
    stubWhatsApp(setup.http)
    stubCustomApi(setup.http, HOST)
    const bellas = expectData(
      await setup.call('bella', 'POST', '', whatsapp({ name: 'Bella WhatsApp' })),
      201,
      connectionDtoSchema,
    )
    const orgWide = await addCustomApi(setup)

    const bellaList = expectPage(await setup.call('bella', 'GET', ''), connectionDtoSchema).data
    expect(bellaList.map((item) => item.id)).toEqual([bellas.id])
    expect(bellaList[0]?.secretLast4).not.toBeNull()
    const benList = expectPage(await setup.call('ben', 'GET', ''), connectionDtoSchema).data
    expect(benList).toEqual([])
    expectError(
      await setup.call('ben', 'GET', `/${bellas.id}`),
      404,
      CONNECTIONS_ERROR_CODES.CONNECTION_NOT_FOUND,
    )

    const adminList = expectPage(await setup.call('adam', 'GET', ''), connectionDtoSchema).data
    expect(adminList.map((item) => item.id).sort((x, y) => x.localeCompare(y))).toEqual(
      [bellas.id, orgWide.id].sort((x, y) => x.localeCompare(y)),
    )
    // never another person's last four characters
    expect(adminList.find((item) => item.id === bellas.id)?.secretLast4).toBeNull()
    expect(adminList.find((item) => item.id === orgWide.id)?.secretLast4).toBe('a4f2')
    const owner = expectPage(await setup.call('olivia', 'GET', ''), connectionDtoSchema).data
    expect(owner).toHaveLength(2)
  })

  it('offers the pickers what the person may use: their own, their teams and the organization', async () => {
    const setup = await setupConnections()
    stubWhatsApp(setup.http)
    stubCustomApi(setup.http, HOST)
    const supportTeam = await setup.addTeam('Support', [setup.builders.bella])
    const salesTeam = await setup.addTeam('Sales', [setup.builders.ben])
    const own = expectData(
      await setup.call('bella', 'POST', '', whatsapp()),
      201,
      connectionDtoSchema,
    )
    const org = await addCustomApi(setup, 'adam', { name: 'Org API' })
    const support = await addCustomApi(setup, 'adam', {
      name: 'Support API',
      scope: 'team',
      teamId: supportTeam,
    })
    await addCustomApi(setup, 'adam', { name: 'Sales API', scope: 'team', teamId: salesTeam })

    const usable = async (who: 'bella' | 'ben' | 'adam') =>
      expectPage(
        await setup.call(who, 'GET', '', undefined, { usable: 'true' }),
        connectionDtoSchema,
      )
        .data.map((item) => item.name)
        .sort((x, y) => x.localeCompare(y))
    expect(await usable('bella')).toEqual(
      ['Org API', 'Support API', own.name].sort((x, y) => x.localeCompare(y)),
    )
    expect(await usable('ben')).toEqual(['Org API', 'Sales API'])
    // an Admin outside both teams uses the organization's connection only
    expect(await usable('adam')).toEqual([org.name])

    // a Builder opens a connection they may use, but not a team's they are not in
    expectData(await setup.call('ben', 'GET', `/${org.id}`), 200, connectionDtoSchema)
    expectError(
      await setup.call('ben', 'GET', `/${support.id}`),
      404,
      CONNECTIONS_ERROR_CODES.CONNECTION_NOT_FOUND,
    )
  })

  it('filters by app, use, scope and status, and hides disconnected ones until asked', async () => {
    const setup = await setupConnections()
    stubWhatsApp(setup.http)
    stubCustomApi(setup.http, HOST)
    const api = await addCustomApi(setup)
    expectData(
      await setup.call('adam', 'POST', '', whatsapp({ scope: 'organization' })),
      201,
      connectionDtoSchema,
    )
    const names = async (query: Record<string, string>) =>
      expectPage(await setup.call('adam', 'GET', '', undefined, query), connectionDtoSchema).data

    expect(await names({ providerKey: 'whatsapp' })).toHaveLength(1)
    expect((await names({ kind: 'api_tool' }))[0]?.id).toBe(api.id)
    expect(await names({ kind: 'channel' })).toHaveLength(1)
    expect(await names({ kind: 'bridge' })).toEqual([])
    expect(await names({ q: 'acme api' })).toHaveLength(1)
    expect(await names({ scope: 'personal' })).toEqual([])

    expectData(await setup.call('adam', 'POST', `/${api.id}/revoke`), 200, connectionDtoSchema)
    expect(await names({})).toHaveLength(1)
    expect((await names({ status: 'revoked' }))[0]?.id).toBe(api.id)
  })

  it('lists what the Add connection dialog offers, with what the install has set up', async () => {
    const setup = await setupConnections()
    stubWhatsApp(setup.http)
    expectData(await setup.call('bella', 'POST', '', whatsapp()), 201, connectionDtoSchema)
    const cards = expectData(
      await setup.call('bella', 'GET', '/providers'),
      200,
      connectionProviderDtoSchema.array(),
    )
    expect(cards.map((card) => card.providerKey).sort((x, y) => x.localeCompare(y))).toEqual(
      ['google-drive', 'http', 'mcp', 'notion', 'slack', 'whatsapp'].sort((x, y) =>
        x.localeCompare(y),
      ),
    )
    const byKey = (key: string) => cards.find((card) => card.providerKey === key)
    expect(byKey('google-drive')).toMatchObject({ oauthConfigured: false, oauthFlows: [] })
    expect(byKey('whatsapp')).toMatchObject({
      connectionCount: 1,
      requiredExtra: ['phoneNumberId', 'appSecret'],
    })
    // client credentials need no app registered at the install
    expect(byKey('http')).toMatchObject({
      oauthConfigured: true,
      oauthFlows: ['client_credentials'],
    })
  })
})

describe('testing, renaming and reconnecting', () => {
  it('records the status of a check and recovers when the app answers again', async () => {
    const setup = await setupConnections()
    stubCustomApi(setup.http, HOST)
    const connection = await addCustomApi(setup)

    setup.http.reset()
    stubCustomApi(setup.http, HOST, 401)
    const failed = expectData(
      await setup.call('adam', 'POST', `/${connection.id}/test`),
      200,
      connectionCheckDtoSchema,
    )
    expect(failed).toMatchObject({
      ok: false,
      reasonCode: CONNECTIONS_ERROR_CODES.CONNECTION_PROVIDER_REJECTED,
      connection: {
        status: 'error',
        statusReasonCode: CONNECTIONS_ERROR_CODES.CONNECTION_PROVIDER_REJECTED,
      },
    })

    setup.http.reset()
    stubCustomApi(setup.http, HOST)
    const recovered = expectData(
      await setup.call('adam', 'POST', `/${connection.id}/test`),
      200,
      connectionCheckDtoSchema,
    )
    expect(recovered).toMatchObject({
      ok: true,
      latencyMs: 12,
      reasonCode: null,
      connection: { status: 'active', statusReasonCode: null },
    })
  })

  it('renames, edits the address, and keeps other people’s connections to Admins', async () => {
    const setup = await setupConnections()
    stubWhatsApp(setup.http)
    stubCustomApi(setup.http, HOST)
    const mine = expectData(
      await setup.call('bella', 'POST', '', whatsapp()),
      201,
      connectionDtoSchema,
    )
    const org = await addCustomApi(setup)

    expect(
      expectData(
        await setup.call('bella', 'PATCH', `/${mine.id}`, { name: 'Support line' }),
        200,
        connectionDtoSchema,
      ).name,
    ).toBe('Support line')
    // Bella sees the organization's connection through pickers but may not change it
    expectError(
      await setup.call('bella', 'PATCH', `/${org.id}`, { name: 'Taken' }),
      403,
      ERROR_CODES.ACCESS_FORBIDDEN,
    )
    expectError(
      await setup.call('adam', 'PATCH', `/${mine.id}`, { baseUrl: 'https://example.test' }),
      422,
      ERROR_CODES.VALIDATION_FAILED,
    )
    const moved = expectData(
      await setup.call('adam', 'PATCH', `/${org.id}`, { baseUrl: 'https://api2.acme.test' }),
      200,
      connectionDtoSchema,
    )
    expect(moved.baseUrl).toBe('https://api2.acme.test')
    expectError(
      await setup.call('adam', 'PATCH', `/${org.id}`, { baseUrl: 'http://api2.acme.test' }),
      422,
      CONNECTIONS_ERROR_CODES.CONNECTION_BASE_URL_NOT_ALLOWED,
    )
  })

  it('replaces a key after checking the new one, for the same account', async () => {
    const setup = await setupConnections()
    stubWhatsApp(setup.http)
    const connection = expectData(
      await setup.call('bella', 'POST', '', whatsapp()),
      201,
      connectionDtoSchema,
    )
    const before = await rowOf(setup, connection.id)

    // a new token the app rejects changes nothing
    setup.http.reset()
    stubWhatsApp(setup.http, { status: 401 })
    expectError(
      await setup.call('bella', 'POST', `/${connection.id}/reconnect`, {
        authType: 'bearer',
        secret: 'test-whatsapp-rejected-token',
      }),
      422,
      CONNECTIONS_ERROR_CODES.CONNECTION_PROVIDER_REJECTED,
    )
    expect((await rowOf(setup, connection.id))?.secretLast4).toBe(before?.secretLast4)

    setup.http.reset()
    stubWhatsApp(setup.http)
    const reconnected = expectData(
      await setup.call('bella', 'POST', `/${connection.id}/reconnect`, {
        authType: 'bearer',
        secret: 'test-whatsapp-renewed-token',
      }),
      200,
      connectionDtoSchema,
    )
    expect(reconnected).toMatchObject({ id: connection.id, status: 'active', secretLast4: 'oken' })
    expect(
      (await rowOf(setup, connection.id))?.secretCiphertext?.equals(
        before?.secretCiphertext ?? Buffer.alloc(0),
      ),
    ).toBe(false)
    expect(await auditActions(setup, 'connection.reconnected')).toHaveLength(1)

    // not with another kind of credentials, and not by someone else's hand
    expectError(
      await setup.call('bella', 'POST', `/${connection.id}/reconnect`, {
        authType: 'api_key',
        secret: 'something-else',
      }),
      422,
      CONNECTIONS_ERROR_CODES.CONNECTION_AUTH_TYPE_UNSUPPORTED,
    )
    expectError(
      await setup.call('ben', 'POST', `/${connection.id}/reconnect`, {
        authType: 'bearer',
        secret: 'test-whatsapp-intruder',
      }),
      404,
      CONNECTIONS_ERROR_CODES.CONNECTION_NOT_FOUND,
    )
  })
})

describe('disconnecting', () => {
  it('deletes the secret at once and keeps the row and its history', async () => {
    const setup = await setupConnections()
    stubCustomApi(setup.http, HOST)
    const connection = await addCustomApi(setup)

    const impact = expectData(
      await setup.call('adam', 'GET', `/${connection.id}/impact`),
      200,
      connectionImpactDtoSchema,
    )
    expect(impact).toEqual({ dependents: [], listed: [] })

    const revoked = expectData(
      await setup.call('adam', 'POST', `/${connection.id}/revoke`),
      200,
      connectionDtoSchema,
    )
    expect(revoked).toMatchObject({ status: 'revoked', secretLast4: null })
    expect(revoked.revokedAt).not.toBeNull()
    const row = await rowOf(setup, connection.id)
    expect(row).toMatchObject({
      status: 'revoked',
      secretCiphertext: null,
      secretIv: null,
      secretAuthTag: null,
      dataKeyVersion: null,
      secretLast4: null,
      secretFingerprint: null,
      revokedByUserId: setup.a.members.adam.id,
    })
    expect(await auditActions(setup, 'connection.revoked')).toHaveLength(1)

    // final: it cannot change, be tested, reconnected or disconnected again
    for (const [method, path, payload] of [
      ['POST', `/${connection.id}/test`, undefined],
      ['POST', `/${connection.id}/revoke`, undefined],
      ['PATCH', `/${connection.id}`, { name: 'Back' }],
      ['POST', `/${connection.id}/reconnect`, { authType: 'api_key', secret: 'new-key-value' }],
    ] as const) {
      expectError(
        await setup.call('adam', method, path, payload),
        409,
        CONNECTIONS_ERROR_CODES.CONNECTION_REVOKED,
      )
    }
    // adding the same app again creates a new connection
    expect((await addCustomApi(setup)).id).not.toBe(connection.id)
  })

  it('lets a Builder disconnect their own connection but not the organization’s', async () => {
    const setup = await setupConnections()
    stubWhatsApp(setup.http)
    stubCustomApi(setup.http, HOST)
    const mine = expectData(
      await setup.call('bella', 'POST', '', whatsapp()),
      201,
      connectionDtoSchema,
    )
    const org = await addCustomApi(setup)
    expectError(
      await setup.call('bella', 'POST', `/${org.id}/revoke`),
      403,
      ERROR_CODES.ACCESS_FORBIDDEN,
    )
    expectData(await setup.call('bella', 'POST', `/${mine.id}/revoke`), 200, connectionDtoSchema)
    expect(
      await setup.db.tenant(setup.a.id, (tx) =>
        tx.select().from(outboxEvents).where(eq(outboxEvents.topic, 'connection.expired')),
      ),
    ).toHaveLength(0)
  })
})

describe('deleting a team', () => {
  it('counts the team’s connections in the dialog, and they go with the team', async () => {
    const setup = await setupConnections()
    stubCustomApi(setup.http, HOST)
    const teamId = await setup.addTeam('Support', [setup.builders.bella])
    const shared = await addCustomApi(setup, 'adam', { scope: 'team', teamId })
    await addCustomApi(setup, 'adam', { name: 'Org API' })

    const teamUrl = `/api/v1/orgs/${setup.a.id}/teams/${teamId}`
    const impact = await setup.callAt('adam', 'GET', `${teamUrl}/deletion-impact`)
    expect(impact.json<{ data: { connectionCount: number } }>().data.connectionCount).toBe(1)

    expect((await setup.callAt('adam', 'DELETE', teamUrl)).statusCode).toBe(204)
    expect(await rowOf(setup, shared.id)).toBeUndefined()
    expect(expectPage(await setup.call('adam', 'GET', ''), connectionDtoSchema).data).toHaveLength(
      1,
    )
  })
})
