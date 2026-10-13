// SPDX-License-Identifier: AGPL-3.0-only
import { createHash } from 'node:crypto'

import { eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'

import { connections } from '@/database/tables/index.js'
import {
  CONNECTIONS_ERROR_CODES,
  ERROR_CODES,
  oauthCompleteDtoSchema,
  oauthStartDtoSchema,
} from '@surefy/contracts'

import {
  GOOGLE_ENV,
  MAYA,
  setupConnections,
  stubGoogle,
  type ConnectionsSetup,
  type Who,
} from './connectionsTestKit.js'
import { formOf } from '../../../../test/fixtures/fakeHttp.js'
import { TEST_APP_ORIGIN } from '../../../../test/helpers/auth.js'
import { expectData, expectError } from '../../../../test/helpers/request.js'

const begin = async (setup: ConnectionsSetup, who: Who, extra: Record<string, unknown> = {}) =>
  expectData(
    await setup.call(who, 'POST', '/oauth/start', {
      providerKey: 'google-drive',
      scope: 'organization',
      ...extra,
    }),
    200,
    oauthStartDtoSchema,
  )

const finish = (setup: ConnectionsSetup, who: Who, state: string, code: string) =>
  setup.call(who, 'POST', '/oauth/complete', { state, code })

const signIn = async (setup: ConnectionsSetup, code = 'code-maya', who: Who = 'adam') => {
  const { state } = await begin(setup, who)
  return expectData(await finish(setup, who, state, code), 200, oauthCompleteDtoSchema)
}

const rowOf = async (setup: ConnectionsSetup, id: string) => {
  const [row] = await setup.db.tenant(setup.a.id, (tx) =>
    tx.select().from(connections).where(eq(connections.id, id)),
  )
  return row
}

const setupGoogle = async () => {
  const setup = await setupConnections({ env: GOOGLE_ENV })
  stubGoogle(setup.http)
  return setup
}

describe('starting a sign-in', () => {
  it('sends the browser to the app with a state and a PKCE challenge', async () => {
    const setup = await setupGoogle()
    const started = await begin(setup, 'adam', { name: 'Team drive', returnTo: '/knowledge' })
    const url = new URL(started.authorizationUrl)
    expect(url.origin + url.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth')
    expect(url.searchParams.get('client_id')).toBe('google-client-id')
    expect(url.searchParams.get('redirect_uri')).toBe(
      `${TEST_APP_ORIGIN}/settings/connections/callback`,
    )
    expect(url.searchParams.get('state')).toBe(started.state)
    expect(url.searchParams.get('code_challenge_method')).toBe('S256')
    expect(url.searchParams.get('access_type')).toBe('offline')
    expect(url.searchParams.get('code_challenge')?.length).toBeGreaterThan(30)
    const minutes = (new Date(started.expiresAt).getTime() - Date.now()) / 60_000
    expect(minutes).toBeGreaterThan(9)
    expect(minutes).toBeLessThanOrEqual(10)
    // the client secret never travels through the browser
    expect(started.authorizationUrl).not.toContain('google-client-secret')
  })

  it('says so when the install has not set the app up, and refuses what it cannot do', async () => {
    const plain = await setupConnections()
    expectError(
      await plain.call('adam', 'POST', '/oauth/start', {
        providerKey: 'google-drive',
        scope: 'organization',
      }),
      422,
      CONNECTIONS_ERROR_CODES.CONNECTION_AUTH_TYPE_UNSUPPORTED,
    )

    const setup = await setupGoogle()
    // no authorization code flow for custom APIs, none for an app without a redirect
    expectError(
      await setup.call('adam', 'POST', '/oauth/start', {
        providerKey: 'whatsapp',
        scope: 'organization',
      }),
      422,
      CONNECTIONS_ERROR_CODES.CONNECTION_AUTH_TYPE_UNSUPPORTED,
    )
    expectError(
      await setup.call('adam', 'POST', '/oauth/start', {
        providerKey: 'acme-billing',
        scope: 'organization',
      }),
      422,
      CONNECTIONS_ERROR_CODES.CONNECTION_PROVIDER_UNSUPPORTED,
    )
    // a Builder signs in for themselves only
    expectError(
      await setup.call('bella', 'POST', '/oauth/start', {
        providerKey: 'google-drive',
        scope: 'organization',
      }),
      403,
      ERROR_CODES.ACCESS_FORBIDDEN,
    )
    expect(
      (
        await setup.call('bella', 'POST', '/oauth/start', {
          providerKey: 'google-drive',
          scope: 'personal',
        })
      ).statusCode,
    ).toBe(200)
  })
})

describe('finishing a sign-in', () => {
  it('stores the connection, encrypted, for the account the app names', async () => {
    const setup = await setupGoogle()
    const started = await begin(setup, 'adam', { name: 'Team drive', returnTo: '/knowledge' })
    const done = expectData(
      await finish(setup, 'adam', started.state, 'code-maya'),
      200,
      oauthCompleteDtoSchema,
    )
    expect(done).toMatchObject({
      outcome: 'created',
      returnTo: '/knowledge',
      connection: {
        providerKey: 'google-drive',
        kind: 'knowledge_connector',
        authType: 'oauth2',
        name: 'Team drive',
        scope: 'organization',
        externalAccountLabel: 'maya@acme.com',
        oauthScopes: ['https://www.googleapis.com/auth/drive.readonly'],
        secretLast4: null,
        status: 'active',
      },
    })
    expect(done.connection.tokenExpiresAt).not.toBeNull()
    const row = await rowOf(setup, done.connection.id)
    expect(row?.secretCiphertext?.toString('utf8')).not.toContain('access-code-maya')
    expect(row?.externalAccountId).toBe('perm-maya')

    // PKCE: the verifier sent with the code hashes to the challenge sent with the sign-in
    const challenge = new URL(started.authorizationUrl).searchParams.get('code_challenge')
    const [tokenCall] = setup.http.callsTo('oauth2.googleapis.com/token')
    const verifier = tokenCall === undefined ? '' : (formOf(tokenCall).get('code_verifier') ?? '')
    expect(createHash('sha256').update(verifier).digest('base64url')).toBe(challenge)
    expect(JSON.stringify(done)).not.toContain('access-code-maya')
    expect(JSON.stringify(done)).not.toContain('refresh-code-maya')
  })

  it('names the connection after the account when no name was given', async () => {
    const setup = await setupGoogle()
    expect((await signIn(setup)).connection.name).toBe('maya@acme.com')
  })

  it('uses a sign-in once, and only for the person and organization that started it', async () => {
    const setup = await setupGoogle()
    const started = await begin(setup, 'adam')
    expectError(
      await finish(setup, 'olivia', started.state, 'code-maya'),
      422,
      CONNECTIONS_ERROR_CODES.CONNECTION_OAUTH_STATE_INVALID,
    )
    // the attempt is spent even when the wrong person tried it
    expectError(
      await finish(setup, 'adam', started.state, 'code-maya'),
      422,
      CONNECTIONS_ERROR_CODES.CONNECTION_OAUTH_STATE_INVALID,
    )
    expectError(
      await finish(setup, 'adam', 'not-a-state', 'code-maya'),
      422,
      CONNECTIONS_ERROR_CODES.CONNECTION_OAUTH_STATE_INVALID,
    )
    const second = await begin(setup, 'adam')
    expectData(await finish(setup, 'adam', second.state, 'code-maya'), 200, oauthCompleteDtoSchema)
    expectError(
      await finish(setup, 'adam', second.state, 'code-alex'),
      422,
      CONNECTIONS_ERROR_CODES.CONNECTION_OAUTH_STATE_INVALID,
    )
  })

  it('stores nothing when the person declines or the app refuses the code', async () => {
    const setup = await setupGoogle()
    const declined = await begin(setup, 'adam')
    expectError(
      await setup.call('adam', 'POST', '/oauth/complete', {
        state: declined.state,
        error: 'access_denied',
        errorDescription: 'The user denied access',
      }),
      422,
      CONNECTIONS_ERROR_CODES.CONNECTION_OAUTH_DENIED,
    )
    const refused = await begin(setup, 'adam')
    expectError(
      await finish(setup, 'adam', refused.state, 'code-unknown'),
      422,
      CONNECTIONS_ERROR_CODES.CONNECTION_OAUTH_DENIED,
    )
    expect(await setup.db.tenant(setup.a.id, (tx) => tx.select().from(connections))).toEqual([])
  })

  it('does not add the same account twice in one scope', async () => {
    const setup = await setupGoogle()
    const first = await signIn(setup)
    const duplicate = await begin(setup, 'adam')
    const error = expectError(
      await finish(setup, 'adam', duplicate.state, 'code-maya'),
      409,
      CONNECTIONS_ERROR_CODES.CONNECTION_DUPLICATE,
    )
    expect(JSON.stringify(error.details)).toContain(first.connection.id)
    expect((await signIn(setup, 'code-alex')).connection.externalAccountLabel).toBe('alex@acme.com')
  })
})

describe('reconnecting through the app', () => {
  it('replaces the tokens of the same account and keeps the connection', async () => {
    const setup = await setupGoogle()
    const { connection } = await signIn(setup)
    const before = await rowOf(setup, connection.id)

    const started = await begin(setup, 'adam', { reconnectConnectionId: connection.id })
    const done = expectData(
      await finish(setup, 'adam', started.state, 'code-maya'),
      200,
      oauthCompleteDtoSchema,
    )
    expect(done).toMatchObject({ outcome: 'reconnected', connection: { id: connection.id } })
    const after = await rowOf(setup, connection.id)
    expect(after?.secretCiphertext?.equals(before?.secretCiphertext ?? Buffer.alloc(0))).toBe(false)
    expect(after?.status).toBe('active')
  })

  it('must be the same account, and says which one was expected', async () => {
    const setup = await setupGoogle()
    const { connection } = await signIn(setup)
    const before = await rowOf(setup, connection.id)
    const started = await begin(setup, 'adam', { reconnectConnectionId: connection.id })
    const error = expectError(
      await finish(setup, 'adam', started.state, 'code-alex'),
      422,
      CONNECTIONS_ERROR_CODES.CONNECTION_ACCOUNT_MISMATCH,
    )
    expect(JSON.stringify(error.details)).toContain(MAYA.email)
    const after = await rowOf(setup, connection.id)
    expect(after?.secretCiphertext?.equals(before?.secretCiphertext ?? Buffer.alloc(0))).toBe(true)
  })

  it('refuses a target that does not match the connection, or one that is not yours', async () => {
    const setup = await setupGoogle()
    const { connection } = await signIn(setup)
    expectError(
      await setup.call('adam', 'POST', '/oauth/start', {
        providerKey: 'google-drive',
        scope: 'personal',
        reconnectConnectionId: connection.id,
      }),
      422,
      ERROR_CODES.VALIDATION_FAILED,
    )
    expectError(
      await setup.call('bella', 'POST', '/oauth/start', {
        providerKey: 'google-drive',
        scope: 'organization',
        reconnectConnectionId: connection.id,
      }),
      403,
      ERROR_CODES.ACCESS_FORBIDDEN,
    )
  })

  it('revokes the grant at the app when the connection is disconnected', async () => {
    const setup = await setupGoogle()
    const { connection } = await signIn(setup)
    expectData(
      await setup.call('adam', 'POST', `/${connection.id}/revoke`),
      200,
      oauthCompleteDtoSchema.shape.connection,
    )
    const [revoke] = setup.http.callsTo('oauth2.googleapis.com/revoke')
    expect(
      formOf(revoke ?? { kind: 'provider', url: '', request: { method: 'POST' } }).get('token'),
    ).toBe('refresh-code-maya')
  })
})
