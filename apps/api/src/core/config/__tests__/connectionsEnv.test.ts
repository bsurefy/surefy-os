// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, it } from 'vitest'

import { parseConfig } from '../index.js'
import { validEnv } from './env.fixture.js'

describe('connections settings', () => {
  it('has no OAuth apps and no local hosts by default', () => {
    expect(parseConfig('api', validEnv).connections).toEqual({ oauthApps: {}, localHosts: [] })
  })

  it('enables an app only when both its values are set, and lists local hosts lowercase', () => {
    const config = parseConfig('api', {
      ...validEnv,
      CONNECTIONS_OAUTH_GOOGLE_DRIVE_CLIENT_ID: 'id',
      CONNECTIONS_OAUTH_GOOGLE_DRIVE_CLIENT_SECRET: 'secret',
      CONNECTIONS_LOCAL_HOSTS: ' Localhost, mcp.internal ,',
    })
    expect(config.connections).toEqual({
      oauthApps: { 'google-drive': { clientId: 'id', clientSecret: 'secret' } },
      localHosts: ['localhost', 'mcp.internal'],
    })
  })

  it('refuses half an app', () => {
    expect(() =>
      parseConfig('api', { ...validEnv, CONNECTIONS_OAUTH_SLACK_CLIENT_ID: 'id' }),
    ).toThrow(/CONNECTIONS_OAUTH_SLACK_CLIENT_SECRET/)
  })
})

describe('other provider origins', () => {
  const local = { ...validEnv, CONNECTIONS_LOCAL_HOSTS: '127.0.0.1' }

  it('moves Drive, Notion, Slack and WhatsApp to stub servers on a local host', () => {
    const config = parseConfig('api', {
      ...local,
      CONNECTIONS_PROVIDER_ORIGINS:
        'google-drive=http://127.0.0.1:4026, notion=http://127.0.0.1:4027, slack=http://127.0.0.1:4028, whatsapp=http://127.0.0.1:4028',
    })
    expect(config.connections.providerOrigins).toEqual({
      'google-drive': 'http://127.0.0.1:4026',
      notion: 'http://127.0.0.1:4027',
      slack: 'http://127.0.0.1:4028',
      whatsapp: 'http://127.0.0.1:4028',
    })
  })

  it.each([
    ['teams=http://127.0.0.1:4026', /is not google-drive or notion or slack or whatsapp=origin/],
    ['notion=http://127.0.0.1:4026/v1', /is not an http\(s\) origin/],
    ['notion=ftp://127.0.0.1', /is not an http\(s\) origin/],
    ['notion=http://stub.example.test', /is not on CONNECTIONS_LOCAL_HOSTS/],
  ])('refuses %s', (value, message) => {
    expect(() => parseConfig('api', { ...local, CONNECTIONS_PROVIDER_ORIGINS: value })).toThrow(
      message,
    )
  })

  it('is refused in production', () => {
    expect(() =>
      parseConfig('api', {
        ...local,
        NODE_ENV: 'production',
        CONNECTIONS_PROVIDER_ORIGINS: 'notion=http://127.0.0.1:4026',
      }),
    ).toThrow(/development and tests only[\s\S]*CONNECTIONS_PROVIDER_ORIGINS/)
  })
})
