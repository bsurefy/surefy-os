// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, it } from 'vitest'

import {
  BUILT_IN_CONNECTION_PROVIDERS,
  CONNECTION_AUDIT_ACTIONS,
  CONNECTION_STATUS_REASON_CODES,
  CONNECTIONS_ERROR_CODES,
  CONNECTIONS_PERMISSIONS,
  completeOauthInputSchema,
  connectionProviderKeySchema,
  connectionSecretSchema,
  createConnectionInputSchema,
  ERROR_CODES,
  FILTER_VALUES_MAX,
  findBuiltInConnectionProvider,
  listConnectionsQuerySchema,
  reconnectConnectionInputSchema,
  ROLE_PERMISSIONS,
  startOauthInputSchema,
  updateConnectionInputSchema,
} from '../index.js'

const teamId = '0190a5c4-0000-7000-8000-000000000001'

describe('connection providers', () => {
  it('accepts built-in and hyphenated bridge keys, and rejects other shapes', () => {
    for (const key of ['slack', 'google-sheets', 'http']) {
      expect(connectionProviderKeySchema.safeParse(key).success).toBe(true)
    }
    for (const key of ['Slack', 'google_sheets', '-slack', 'slack-', '', '1app']) {
      expect(connectionProviderKeySchema.safeParse(key).success).toBe(false)
    }
  })

  it('lists each built-in provider once, with a way to sign in that matches its OAuth flows', () => {
    const keys = BUILT_IN_CONNECTION_PROVIDERS.map((provider) => provider.key)
    expect(new Set(keys).size).toBe(keys.length)
    for (const provider of BUILT_IN_CONNECTION_PROVIDERS) {
      expect(provider.authTypes.length).toBeGreaterThan(0)
      const flows: readonly string[] = provider.oauthFlows
      const oauth: readonly string[] = provider.authTypes
      expect(flows.length > 0).toBe(oauth.includes('oauth2'))
    }
    expect(findBuiltInConnectionProvider('mcp')?.requiresBaseUrl).toBe(true)
    expect(findBuiltInConnectionProvider('whatsapp')?.requiredExtra).toEqual([
      'phoneNumberId',
      'appSecret',
    ])
    expect(findBuiltInConnectionProvider('unknown')).toBeUndefined()
  })
})

describe('connection schemas', () => {
  it('turns repeated filter values into arrays and checks the sort and the usable flag', () => {
    expect(listConnectionsQuerySchema.parse({ status: 'expired' }).status).toEqual(['expired'])
    expect(listConnectionsQuerySchema.parse({ kind: ['mcp_server', 'channel'] }).kind).toEqual([
      'mcp_server',
      'channel',
    ])
    expect(listConnectionsQuerySchema.parse({ usable: 'false' }).usable).toBe(false)
    expect(
      listConnectionsQuerySchema.safeParse({
        scope: Array.from({ length: FILTER_VALUES_MAX + 1 }, () => 'team'),
      }).success,
    ).toBe(false)
    expect(listConnectionsQuerySchema.safeParse({ sort: '-lastUsedAt' }).success).toBe(true)
    expect(listConnectionsQuerySchema.safeParse({ sort: 'secret' }).success).toBe(false)
  })

  it('creates a connection by the way it signs in', () => {
    const base = { providerKey: 'http', scope: 'organization', baseUrl: 'https://api.acme.com' }
    expect(createConnectionInputSchema.safeParse({ ...base, authType: 'none' }).success).toBe(true)
    expect(createConnectionInputSchema.safeParse({ ...base, authType: 'api_key' }).success).toBe(
      false,
    )
    expect(
      createConnectionInputSchema.safeParse({ ...base, authType: 'bearer', secret: ' tok ' }),
    ).toMatchObject({ success: true, data: { secret: 'tok' } })
    expect(
      createConnectionInputSchema.safeParse({ ...base, authType: 'basic', username: 'a' }).success,
    ).toBe(false)
    expect(
      createConnectionInputSchema.safeParse({
        ...base,
        authType: 'oauth2',
        tokenUrl: 'https://auth.acme.com/token',
        clientId: 'id',
        clientSecret: 'secret',
      }).success,
    ).toBe(true)
    expect(
      createConnectionInputSchema.safeParse({
        ...base,
        authType: 'bearer',
        secret: 'x',
        baseUrl: 'file:///x',
      }).success,
    ).toBe(false)
  })

  it('needs a team for the team scope and forbids one for the other scopes', () => {
    const base = { providerKey: 'whatsapp', authType: 'none' }
    expect(createConnectionInputSchema.safeParse({ ...base, scope: 'team' }).success).toBe(false)
    expect(createConnectionInputSchema.safeParse({ ...base, scope: 'team', teamId }).success).toBe(
      true,
    )
    expect(
      createConnectionInputSchema.safeParse({ ...base, scope: 'personal', teamId }).success,
    ).toBe(false)
    expect(startOauthInputSchema.safeParse({ providerKey: 'slack', scope: 'team' }).success).toBe(
      false,
    )
    expect(
      startOauthInputSchema.safeParse({ providerKey: 'slack', scope: 'team', teamId }).success,
    ).toBe(true)
  })

  it('never takes a redirect target outside the workspace', () => {
    const base = { providerKey: 'slack', scope: 'organization' }
    expect(startOauthInputSchema.safeParse({ ...base, returnTo: '/agents/new' }).success).toBe(true)
    expect(
      startOauthInputSchema.safeParse({ ...base, returnTo: 'https://evil.test' }).success,
    ).toBe(false)
    expect(startOauthInputSchema.safeParse({ ...base, returnTo: '//evil.test' }).success).toBe(
      false,
    )
  })

  it('completes a sign-in with a code or with an error, never both or neither', () => {
    expect(completeOauthInputSchema.safeParse({ state: 's', code: 'c' }).success).toBe(true)
    expect(completeOauthInputSchema.safeParse({ state: 's', error: 'access_denied' }).success).toBe(
      true,
    )
    expect(completeOauthInputSchema.safeParse({ state: 's' }).success).toBe(false)
    expect(completeOauthInputSchema.safeParse({ state: 's', code: 'c', error: 'e' }).success).toBe(
      false,
    )
  })

  it('reconnects only with credentials, and updates only the label and address', () => {
    expect(reconnectConnectionInputSchema.safeParse({ authType: 'none' }).success).toBe(false)
    expect(
      reconnectConnectionInputSchema.safeParse({ authType: 'api_key', secret: 'k' }).success,
    ).toBe(true)
    expect(updateConnectionInputSchema.parse({ name: ' Acme ', providerKey: 'x' })).toEqual({
      name: 'Acme',
    })
  })

  it('checks the stored secret document by its version', () => {
    expect(connectionSecretSchema.safeParse({ version: 1, accessToken: 'a' }).success).toBe(true)
    expect(connectionSecretSchema.safeParse({ version: 2 }).success).toBe(false)
  })
})

describe('connection codes, permissions and audit', () => {
  it('uses error codes that are all registered, with failure reasons among them', () => {
    for (const code of Object.values(CONNECTIONS_ERROR_CODES)) expect(ERROR_CODES[code]).toBe(code)
    for (const code of CONNECTION_STATUS_REASON_CODES) expect(ERROR_CODES[code]).toBe(code)
  })

  it('lets Builders use connections and only Admins manage them', () => {
    expect(ROLE_PERMISSIONS.user).not.toContain(CONNECTIONS_PERMISSIONS.CONNECTIONS_USE.key)
    expect(ROLE_PERMISSIONS.builder).toContain(CONNECTIONS_PERMISSIONS.CONNECTIONS_USE.key)
    expect(ROLE_PERMISSIONS.builder).not.toContain(CONNECTIONS_PERMISSIONS.CONNECTIONS_MANAGE.key)
    expect(ROLE_PERMISSIONS.admin).toContain(CONNECTIONS_PERMISSIONS.CONNECTIONS_MANAGE.key)
  })

  it('names audit actions <area>.<verb>', () => {
    for (const action of Object.values(CONNECTION_AUDIT_ACTIONS)) {
      expect(action).toMatch(/^connection\.[a-z_]+$/)
    }
  })
})
