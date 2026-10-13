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
