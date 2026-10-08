// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, it } from 'vitest'

import { CONNECTIONS_ERROR_CODES } from '@surefy/contracts'

import { createFakeHttp } from '../../../../test/fixtures/fakeHttp.js'
import { OutboundError } from '../connectionsHttp.js'
import { createProviderAdapters, TokenRequestError } from '../providers/index.js'
import { authHeaders, readTokens, splitScopes } from '../providers/providerHttp.js'

import type { HttpResult } from '../connectionsHttp.js'

const answer = (status: number, body: unknown): HttpResult => ({
  status,
  headers: {},
  text: JSON.stringify(body),
  latencyMs: 5,
})

const adapters = createProviderAdapters()
const adapter = (key: string) => {
  const found = adapters.get(key)
  if (found === undefined) throw new Error(`no adapter ${key}`)
  return found
}

describe('token answers', () => {
  it('reads tokens, scopes and expiry', () => {
    expect(
      readTokens(
        answer(200, {
          access_token: 'a',
          refresh_token: 'r',
          expires_in: 3600,
          scope: 'one two,three',
        }),
        ['fallback'],
      ),
    ).toEqual({
      accessToken: 'a',
      refreshToken: 'r',
      expiresInSeconds: 3600,
      scopes: ['one', 'two', 'three'],
    })
    expect(readTokens(answer(200, { access_token: 'a' }), ['fallback'])).toEqual({
      accessToken: 'a',
      scopes: ['fallback'],
    })
  })

  it('tells a refusal by the person from a refusal by the app', () => {
    expect(() => readTokens(answer(400, { error: 'access_denied' }), [])).toThrow(
      expect.objectContaining({ kind: 'denied' }),
    )
    expect(() => readTokens(answer(400, { error: 'invalid_grant' }), [])).toThrow(
      expect.objectContaining({ kind: 'rejected', providerCode: 'invalid_grant' }),
    )
    // Slack answers 200 with `ok: false`
    expect(() => readTokens(answer(200, { ok: false, error: 'invalid_code' }), [])).toThrow(
      TokenRequestError,
    )
    expect(() => readTokens(answer(200, {}), [])).toThrow(TokenRequestError)
  })

  it('splits scopes on spaces and commas', () => {
    expect(splitScopes('a b,c  d')).toEqual(['a', 'b', 'c', 'd'])
    expect(splitScopes(undefined)).toEqual([])
  })
})

describe('credentials as headers', () => {
  it('sends tokens as bearer, keys also as x-api-key, and passwords as basic', () => {
    expect(authHeaders({ version: 1, token: 't' })).toEqual({ authorization: 'Bearer t' })
    expect(authHeaders({ version: 1, apiKey: 'k' })).toEqual({
      authorization: 'Bearer k',
      'x-api-key': 'k',
    })
    expect(authHeaders({ version: 1, username: 'u', password: 'p' })).toEqual({
      authorization: `Basic ${Buffer.from('u:p').toString('base64')}`,
    })
    expect(authHeaders({ version: 1 })).toEqual({})
  })
})

describe('checks', () => {
  const check = (key: string, secret: Record<string, unknown>, baseUrl: string | null = null) =>
    adapter(key).check(http, { authType: 'bearer', secret: { version: 1, ...secret }, baseUrl })
  const http = createFakeHttp()

  it('names the account Google, Notion and Slack know', async () => {
    http.reset()
    http.on('googleapis.com/drive/v3/about', {
      body: { user: { emailAddress: 'maya@acme.com', permissionId: 'p-1' } },
    })
    http.on('api.notion.com/v1/users/me', {
      body: { bot: { workspace_name: 'Acme Notes', workspace_id: 'w-1' } },
    })
    http.on('slack.com/api/auth.test', { body: { ok: true, team: 'Acme Slack', team_id: 'T1' } })
    expect(await check('google-drive', { accessToken: 'x' })).toMatchObject({
      ok: true,
      account: { id: 'p-1', label: 'maya@acme.com' },
    })
    expect(await check('notion', { accessToken: 'x' })).toMatchObject({
      ok: true,
      account: { id: 'w-1', label: 'Acme Notes' },
    })
    expect(await check('slack', { accessToken: 'x' })).toMatchObject({
      ok: true,
      account: { id: 'T1', label: 'Acme Slack' },
    })
  })

  it('maps a refusal, a dead token and a silent network to a reason', async () => {
    http.reset()
    http.on('googleapis.com', { status: 401 })
    expect(await check('google-drive', { accessToken: 'x' })).toMatchObject({
      ok: false,
      reasonCode: CONNECTIONS_ERROR_CODES.CONNECTION_PROVIDER_REJECTED,
    })
    http.reset()
    http.on('slack.com', { body: { ok: false, error: 'token_expired' } })
    expect(await check('slack', { accessToken: 'x' })).toMatchObject({
      ok: false,
      reasonCode: CONNECTIONS_ERROR_CODES.CONNECTION_TOKEN_EXPIRED,
    })
    http.reset()
    http.on('slack.com', { status: 503 })
    expect(await check('slack', { accessToken: 'x' })).toMatchObject({
      ok: false,
      reasonCode: CONNECTIONS_ERROR_CODES.CONNECTION_PROVIDER_REJECTED,
    })
    http.reset()
    http.on('googleapis.com', new OutboundError('unreachable', 'offline'))
    expect(await check('google-drive', { accessToken: 'x' })).toMatchObject({
      ok: false,
      reasonCode: CONNECTIONS_ERROR_CODES.CONNECTION_UNREACHABLE,
    })
  })

  it('judges a custom API or an MCP server by whether the address answers and takes the key', async () => {
    http.reset()
    http.on('https://api.acme.test', { status: 404 })
    expect(await check('http', { token: 't' }, 'https://api.acme.test')).toMatchObject({
      ok: true,
      account: { id: null, label: 'api.acme.test' },
    })
    // an MCP server with nothing at its address is not connected
    expect(await check('mcp', { token: 't' }, 'https://api.acme.test/mcp')).toMatchObject({
      ok: false,
      reasonCode: CONNECTIONS_ERROR_CODES.CONNECTION_PROVIDER_REJECTED,
    })
    http.reset()
    http.on('https://private.acme.test', new OutboundError('unsafe', 'private address'))
    expect(await check('http', {}, 'https://private.acme.test')).toMatchObject({
      ok: false,
      unsafeAddress: true,
    })
  })

  it('needs a valid phone number ID for WhatsApp', async () => {
    http.reset()
    expect(await check('whatsapp', { token: 't', extra: { phoneNumberId: '../x' } })).toMatchObject(
      {
        ok: false,
      },
    )
    expect(http.calls).toEqual([])
  })
})
