// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, it } from 'vitest'

import { getRedirectTarget } from './Auth.redirect'

describe('getRedirectTarget', () => {
  it('keeps a same-origin path', () => {
    expect(getRedirectTarget('/acme/agents')).toBe('/acme/agents')
    expect(getRedirectTarget(['/acme/agents', '/other'])).toBe('/acme/agents')
  })

  it('drops anything that could leave the site', () => {
    expect(getRedirectTarget('https://evil.test')).toBeUndefined()
    expect(getRedirectTarget('//evil.test')).toBeUndefined()
    expect(getRedirectTarget(undefined)).toBeUndefined()
  })
})
