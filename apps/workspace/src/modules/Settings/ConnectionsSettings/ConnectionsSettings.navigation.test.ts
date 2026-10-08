// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, it } from 'vitest'

import { getOauthReturnPath } from './ConnectionsSettings.navigation'

describe('getOauthReturnPath', () => {
  it('forwards to the organization with what the app added', () => {
    expect(getOauthReturnPath('acme', { code: 'abc', state: 'xyz' })).toBe(
      '/acme/settings/connections/callback?code=abc&state=xyz',
    )
  })

  it('keeps an error and its description, and repeated values', () => {
    expect(
      getOauthReturnPath('acme', {
        error: 'access_denied',
        error_description: 'The user said no',
        scope: ['a', 'b'],
        ignored: undefined,
      }),
    ).toBe(
      '/acme/settings/connections/callback?error=access_denied&error_description=The+user+said+no&scope=a&scope=b',
    )
  })

  it('adds no query when the app added nothing', () => {
    expect(getOauthReturnPath('acme', {})).toBe('/acme/settings/connections/callback')
  })
})
