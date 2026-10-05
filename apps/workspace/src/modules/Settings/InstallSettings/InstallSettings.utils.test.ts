// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, it } from 'vitest'

import {
  getOrganizationLimitState,
  hasUpdate,
  toInstallUpdate,
  toSmtpFormValues,
  toSmtpUpdate,
} from './InstallSettings.utils'

describe('getOrganizationLimitState', () => {
  it('compares the count with the limit', () => {
    expect(getOrganizationLimitState({ count: 1, max: null })).toBe('unlimited')
    expect(getOrganizationLimitState({ count: 1, max: 3 })).toBe('within')
    expect(getOrganizationLimitState({ count: 1, max: 1 })).toBe('atLimit')
    expect(getOrganizationLimitState({ count: 3, max: 1 })).toBe('overLimit')
  })
})

describe('hasUpdate', () => {
  it('is true only when a different version is published', () => {
    expect(hasUpdate({ current: '1.0.0', latest: null })).toBe(false)
    expect(hasUpdate({ current: '1.0.0', latest: '1.0.0' })).toBe(false)
    expect(hasUpdate({ current: '1.0.0', latest: '1.1.0' })).toBe(true)
  })
})

describe('toInstallUpdate', () => {
  const values = {
    emailPassword: true,
    google: false,
    microsoft: false,
    github: true,
    signupPolicy: 'open' as const,
    orgCreationPolicy: 'any_user' as const,
    searxngUrl: '',
  }

  it('sends the creation policy only where it applies and an empty address as null', () => {
    expect(toInstallUpdate(values, false)).not.toHaveProperty('orgCreationPolicy')
    expect(toInstallUpdate(values, true)).toHaveProperty('orgCreationPolicy', 'any_user')
    expect(toInstallUpdate(values, true).webSearch).toEqual({ searxngUrl: null })
  })
})

describe('mail server values', () => {
  it('keeps the stored password unless a new one is typed', () => {
    const base = {
      host: 'smtp.acme.test',
      port: '587',
      secure: false,
      username: '',
      password: '',
      fromAddress: 'noreply@acme.test',
      fromName: '',
    }
    expect(toSmtpUpdate(base).smtp).not.toHaveProperty('password')
    expect(toSmtpUpdate({ ...base, password: 'secret' }).smtp).toHaveProperty('password', 'secret')
    expect(toSmtpUpdate(base).smtp).toMatchObject({ port: 587, username: null, fromName: null })
  })

  it('has defaults when no server is set', () => {
    expect(
      toSmtpFormValues({
        installationId: 'x',
        version: { current: '1', latest: null },
        setupCompletedAt: null,
        signupPolicy: 'invite_only',
        orgCreationPolicy: 'install_admins',
        organizations: { count: 1, max: 1 },
        signIn: {
          emailPassword: true,
          oauth: {
            google: { enabled: false, configured: false },
            microsoft: { enabled: false, configured: false },
            github: { enabled: false, configured: false },
          },
        },
        smtp: null,
        webSearch: { searxngUrl: null },
        updatedAt: '2026-01-01T00:00:00.000Z',
      }).port,
    ).toBe('587')
  })
})
