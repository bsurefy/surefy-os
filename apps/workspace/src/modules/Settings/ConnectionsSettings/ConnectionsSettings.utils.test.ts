// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, it } from 'vitest'

import { BUILT_IN_CONNECTION_PROVIDERS, CONNECTIONS_ERROR_CODES } from '@surefy/contracts'
import type { ConnectionProviderDto } from '@surefy/contracts'

import { SIGN_IN_METHOD } from './ConnectionsSettings.constants'
import {
  buildCreateInput,
  buildReconnectInput,
  buildStartOauthInput,
  getAllowedScopes,
  getExtraFields,
  getImpactSummary,
  getReasonKey,
  getReconnectMethod,
  getRowActions,
  getSignInMethods,
  maskSecret,
  needsAttention,
  safeReturnPath,
  sortAttentionFirst,
  toSortParam,
} from './ConnectionsSettings.utils'
import { connectionFactory } from '../../../../mock/handlers/connections'
import { MAYA, OMAR } from '../../../../mock/handlers/shell.fixtures'

import type { SignInValues } from './ConnectionsSettings.schema'

function provider(key: string, oauthConfigured = true): ConnectionProviderDto {
  const entry = BUILT_IN_CONNECTION_PROVIDERS.find((item) => item.key === key)
  if (!entry) throw new Error(`Unknown provider ${key}`)
  return {
    providerKey: entry.key,
    kind: entry.kind,
    authTypes: [...entry.authTypes],
    oauthFlows: [...entry.oauthFlows],
    requiresBaseUrl: entry.requiresBaseUrl,
    requiredExtra: [...entry.requiredExtra],
    oauthConfigured,
    connectionCount: 0,
  }
}

const EMPTY: SignInValues = {
  name: '',
  baseUrl: '',
  secret: '',
  username: '',
  password: '',
  tokenUrl: '',
  clientId: '',
  clientSecret: '',
  oauthScopes: '',
  extra: {},
}

describe('toSortParam', () => {
  it('reads a leading minus as descending', () => {
    expect(toSortParam('-name')).toEqual({ id: 'name', desc: true })
    expect(toSortParam('lastUsedAt')).toEqual({ id: 'lastUsedAt', desc: false })
  })
})

describe('needsAttention and sortAttentionFirst', () => {
  it('counts expired and erroring connections and puts them first', () => {
    const active = connectionFactory({ name: 'Active' })
    const expired = connectionFactory({ name: 'Expired', status: 'expired' })
    const broken = connectionFactory({ name: 'Broken', status: 'error' })
    const revoked = connectionFactory({ name: 'Gone', status: 'revoked' })
    expect([active, expired, broken, revoked].map(needsAttention)).toEqual([
      false,
      true,
      true,
      false,
    ])
    expect(sortAttentionFirst([active, expired, revoked, broken]).map((row) => row.name)).toEqual([
      'Expired',
      'Broken',
      'Active',
      'Gone',
    ])
  })
})

describe('getRowActions', () => {
  const mine = connectionFactory({ connectedBy: MAYA })
  const theirs = connectionFactory({ connectedBy: OMAR, scope: 'personal', owner: OMAR })

  it('lets Admins and Owners act on anyone’s connection', () => {
    expect(getRowActions(theirs, { canManage: true, userId: MAYA.id }).disconnect).toBe(true)
  })

  it('lets a Builder act only on what they connected', () => {
    expect(getRowActions(mine, { canManage: false, userId: MAYA.id }).disconnect).toBe(true)
    expect(getRowActions(theirs, { canManage: false, userId: MAYA.id }).test).toBe(false)
  })

  it('offers nothing on a disconnected connection', () => {
    const gone = connectionFactory({ status: 'revoked' })
    expect(getRowActions(gone, { canManage: true, userId: MAYA.id }).test).toBe(false)
  })

  it('offers an address only where there is one, and no reconnect without a sign-in', () => {
    const open = connectionFactory({ authType: 'none', baseUrl: 'https://mcp.example.test' })
    const actions = getRowActions(open, { canManage: true, userId: MAYA.id })
    expect(actions.editAddress).toBe(true)
    expect(actions.reconnect).toBe(false)
    expect(getRowActions(mine, { canManage: true, userId: MAYA.id }).editAddress).toBe(false)
  })
})

describe('maskSecret', () => {
  it('shows the end of a key and nothing for OAuth', () => {
    expect(maskSecret('a4f2')).toBe('…a4f2')
    expect(maskSecret(null)).toBeNull()
  })
})

describe('getSignInMethods', () => {
  it('offers Sign in only when the install has the app’s OAuth set up', () => {
    expect(getSignInMethods(provider('slack'))).toEqual([SIGN_IN_METHOD.OAUTH])
    expect(getSignInMethods(provider('slack', false))).toEqual([])
  })

  it('falls back to a token when OAuth is not set up', () => {
    expect(getSignInMethods(provider('notion', false))).toEqual([SIGN_IN_METHOD.BEARER])
    expect(getSignInMethods(provider('notion'))).toEqual([
      SIGN_IN_METHOD.OAUTH,
      SIGN_IN_METHOD.BEARER,
    ])
  })

  it('offers client ID and secret without any install setup', () => {
    expect(getSignInMethods(provider('http', false))).toEqual([
      SIGN_IN_METHOD.API_KEY,
      SIGN_IN_METHOD.BEARER,
      SIGN_IN_METHOD.BASIC,
      SIGN_IN_METHOD.CLIENT_CREDENTIALS,
      SIGN_IN_METHOD.NONE,
    ])
  })
})

describe('getExtraFields', () => {
  it('asks WhatsApp for both IDs and the app secret, and requires the number and the secret', () => {
    expect(getExtraFields(provider('whatsapp'))).toEqual([
      { key: 'phoneNumberId', isRequired: true },
      { key: 'appSecret', isRequired: true },
      { key: 'businessAccountId', isRequired: false },
    ])
    expect(getExtraFields(provider('slack'))).toEqual([])
  })
})

describe('getAllowedScopes', () => {
  it('gives Builders only Just me', () => {
    expect(getAllowedScopes(false)).toEqual(['personal'])
    expect(getAllowedScopes(true)).toEqual(['personal', 'team', 'organization'])
  })
})

describe('building requests', () => {
  const http = provider('http')

  it('builds an API key request with the team only for a team scope', () => {
    const values = {
      ...EMPTY,
      name: 'Billing',
      baseUrl: 'https://billing.example.test',
      secret: 'k',
    }
    expect(buildCreateInput('api_key', http, values, { scope: 'team', teamId: 't1' })).toEqual({
      providerKey: 'http',
      name: 'Billing',
      scope: 'team',
      teamId: 't1',
      baseUrl: 'https://billing.example.test',
      extra: undefined,
      authType: 'api_key',
      secret: 'k',
    })
    const personal = buildCreateInput('api_key', http, values, { scope: 'personal', teamId: 't1' })
    expect(personal).not.toHaveProperty('teamId')
  })

  it('builds basic, client credentials and no sign-in requests', () => {
    expect(
      buildCreateInput(
        'basic',
        http,
        { ...EMPTY, username: 'u', password: 'p' },
        { scope: 'personal' },
      ),
    ).toMatchObject({ authType: 'basic', username: 'u', password: 'p' })
    expect(
      buildCreateInput(
        'clientCredentials',
        http,
        {
          ...EMPTY,
          tokenUrl: 'https://auth.example.test/token',
          clientId: 'id',
          clientSecret: 's',
          oauthScopes: 'read, write  admin',
        },
        { scope: 'organization' },
      ),
    ).toMatchObject({ authType: 'oauth2', oauthScopes: ['read', 'write', 'admin'] })
    expect(buildCreateInput('none', http, EMPTY, { scope: 'organization' })).toMatchObject({
      authType: 'none',
    })
  })

  it('drops empty extra fields and an empty name', () => {
    const whatsapp = provider('whatsapp')
    const input = buildCreateInput(
      'bearer',
      whatsapp,
      { ...EMPTY, secret: 't', extra: { phoneNumberId: '123', businessAccountId: '' } },
      { scope: 'organization' },
    )
    expect(input).toMatchObject({ extra: { phoneNumberId: '123' }, name: undefined })
  })

  it('builds the start of an OAuth sign-in with where to return to', () => {
    expect(
      buildStartOauthInput(
        provider('slack'),
        EMPTY,
        { scope: 'organization' },
        '/acme/settings/connections',
      ),
    ).toMatchObject({
      providerKey: 'slack',
      scope: 'organization',
      returnTo: '/acme/settings/connections',
    })
  })

  it('builds reconnect credentials by how the connection signs in', () => {
    expect(buildReconnectInput({ authType: 'api_key' }, { ...EMPTY, secret: 'new' })).toEqual({
      authType: 'api_key',
      secret: 'new',
    })
    expect(buildReconnectInput({ authType: 'none' }, EMPTY)).toBeNull()
    expect(buildReconnectInput({ authType: 'oauth2' }, EMPTY)).toBeNull()
  })
})

describe('getReconnectMethod', () => {
  it('tells an authorization code sign-in from client credentials by the app', () => {
    expect(getReconnectMethod({ authType: 'oauth2', providerKey: 'slack' })).toBe(
      SIGN_IN_METHOD.OAUTH,
    )
    expect(getReconnectMethod({ authType: 'oauth2', providerKey: 'http' })).toBe(
      SIGN_IN_METHOD.CLIENT_CREDENTIALS,
    )
    expect(getReconnectMethod({ authType: 'oauth2', providerKey: 'mcp' })).toBe(
      SIGN_IN_METHOD.CLIENT_CREDENTIALS,
    )
    expect(getReconnectMethod({ authType: 'bearer', providerKey: 'notion' })).toBe('bearer')
  })
})

describe('safeReturnPath', () => {
  it('accepts a path of the workspace and refuses anything else', () => {
    expect(safeReturnPath('/acme/agents/1', '/fallback')).toBe('/acme/agents/1')
    expect(safeReturnPath('https://evil.test', '/fallback')).toBe('/fallback')
    expect(safeReturnPath('//evil.test', '/fallback')).toBe('/fallback')
    expect(safeReturnPath(null, '/fallback')).toBe('/fallback')
  })
})

describe('getImpactSummary', () => {
  it('groups the dependents and counts the names beyond the list', () => {
    const summary = getImpactSummary({
      dependents: [
        { type: 'agent', count: 54 },
        { type: 'channel', count: 0 },
      ],
      listed: [
        { type: 'agent', id: '1', name: 'A' },
        { type: 'agent', id: '2', name: 'B' },
      ],
    })
    expect(summary.total).toBe(54)
    expect(summary.groups).toEqual([
      {
        type: 'agent',
        count: 54,
        items: [
          { id: '1', name: 'A' },
          { id: '2', name: 'B' },
        ],
        names: ['A', 'B'],
        more: 52,
      },
    ])
  })
})

describe('getReasonKey', () => {
  it('maps a status reason to its message', () => {
    expect(getReasonKey(CONNECTIONS_ERROR_CODES.CONNECTION_TOKEN_EXPIRED)).toBe('expired')
    expect(getReasonKey('SOMETHING_ELSE')).toBeNull()
    expect(getReasonKey(null)).toBeNull()
  })
})
