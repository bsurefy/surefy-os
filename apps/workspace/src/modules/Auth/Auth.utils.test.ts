// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, it } from 'vitest'

import { meFactory, meMembershipFactory } from '@surefy/web-core/testing'

import {
  getAuthErrorKey,
  getPasswordStrength,
  getPostSignInPath,
  getRetryAt,
  getTotpSecret,
} from './Auth.utils'

describe('getPostSignInPath', () => {
  it('sends a person without memberships to the no-organization screen', () => {
    expect(getPostSignInPath(meFactory({ memberships: [] }))).toBe('/no-organization')
  })

  it('opens the only organization', () => {
    const membership = meMembershipFactory()
    expect(getPostSignInPath(meFactory({ memberships: [membership] }))).toBe(
      `/${membership.organization.slug}/chat`,
    )
  })

  it('opens the last-used organization among several', () => {
    const [first, second] = [meMembershipFactory(), meMembershipFactory()]
    const me = meFactory({
      memberships: [first, second],
      preferences: {
        locale: null,
        theme: 'system',
        timezone: null,
        lastOrganizationId: second.organization.id,
      },
    })
    expect(getPostSignInPath(me)).toBe(`/${second.organization.slug}/chat`)
  })

  it('shows the picker for several organizations and no last-used one', () => {
    const me = meFactory({ memberships: [meMembershipFactory(), meMembershipFactory()] })
    expect(getPostSignInPath(me)).toBe('/organizations')
  })
})

describe('getAuthErrorKey', () => {
  it('explains the codes the screens know', () => {
    expect(getAuthErrorKey({ code: 'INVALID_EMAIL_OR_PASSWORD', status: 401 })).toBe(
      'invalidCredentials',
    )
    expect(getAuthErrorKey({ code: 'SIGNUP_CLOSED', status: 403 })).toBe('signupClosed')
  })

  it('treats a rate limit as such whatever its code', () => {
    expect(getAuthErrorKey({ code: 'SOMETHING', status: 429 })).toBe('rateLimited')
  })

  it('falls back to the generic message', () => {
    expect(getAuthErrorKey({ code: 'NEW_CODE', status: 500 })).toBe('generic')
    expect(getAuthErrorKey({ status: 500 })).toBe('generic')
  })
})

describe('getRetryAt', () => {
  const now = new Date('2026-10-04T10:00:00Z')

  it('adds the seconds of the header', () => {
    expect(getRetryAt('90', now).toISOString()).toBe('2026-10-04T10:01:30.000Z')
  })

  it('waits one minute when the header is missing or wrong', () => {
    expect(getRetryAt(null, now).toISOString()).toBe('2026-10-04T10:01:00.000Z')
    expect(getRetryAt('soon', now).toISOString()).toBe('2026-10-04T10:01:00.000Z')
  })
})

describe('getPasswordStrength', () => {
  it('is zero for nothing and rises with length and variety', () => {
    expect(getPasswordStrength('')).toBe(0)
    expect(getPasswordStrength('short')).toBe(0)
    expect(getPasswordStrength('aaaaaaaaaaaa')).toBe(1)
    expect(getPasswordStrength('aaaaaaaaaaaaaaaa')).toBe(2)
    expect(getPasswordStrength('Aaaaaaaaaaaaaaaa')).toBe(3)
    expect(getPasswordStrength('Aaaaaaaaaaaaaa1!')).toBe(4)
  })
})

describe('getTotpSecret', () => {
  it('reads the secret of an otpauth URI', () => {
    expect(getTotpSecret('otpauth://totp/SurefyOS:a@b.test?secret=JBSWY3DP&issuer=SurefyOS')).toBe(
      'JBSWY3DP',
    )
  })

  it('returns nothing for text that is not a URI', () => {
    expect(getTotpSecret('nope')).toBe('')
  })
})
