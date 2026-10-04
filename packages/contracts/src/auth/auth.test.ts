// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, it } from 'vitest'

import {
  emailSchema,
  INSTALL_CAPABILITIES,
  installCapabilitiesDtoSchema,
  meDtoSchema,
  passwordSchema,
  PASSWORD_LENGTH,
  updateMeInputSchema,
} from '../index.js'

describe('auth schemas', () => {
  it('normalizes emails before checking the format', () => {
    expect(emailSchema.parse('  Ada@Example.TEST ')).toBe('ada@example.test')
    expect(emailSchema.safeParse('not-an-email').success).toBe(false)
  })

  it('bounds password length on both sides', () => {
    expect(passwordSchema.safeParse('x'.repeat(PASSWORD_LENGTH.min - 1)).success).toBe(false)
    expect(passwordSchema.safeParse('x'.repeat(PASSWORD_LENGTH.min)).success).toBe(true)
    expect(passwordSchema.safeParse('x'.repeat(PASSWORD_LENGTH.max + 1)).success).toBe(false)
  })

  it('accepts a partial profile update and rejects an empty name', () => {
    expect(updateMeInputSchema.safeParse({}).success).toBe(true)
    expect(updateMeInputSchema.safeParse({ name: '   ' }).success).toBe(false)
  })
})

describe('install capabilities', () => {
  const selfHosted = {
    licenseManagement: true,
    planBilling: false,
    hosting: 'self-hosted',
    compareEditionsUrl: 'https://surefyos.test/editions',
  }

  it('accepts what each entitlement source reports', () => {
    expect(installCapabilitiesDtoSchema.safeParse(selfHosted).success).toBe(true)
    expect(
      installCapabilitiesDtoSchema.safeParse({
        licenseManagement: false,
        planBilling: true,
        hosting: 'cloud',
        compareEditionsUrl: null,
      }).success,
    ).toBe(true)
  })

  it('rejects an unknown hosting and a relative editions link', () => {
    expect(installCapabilitiesDtoSchema.safeParse({ ...selfHosted, hosting: 'edge' }).success).toBe(
      false,
    )
    expect(
      installCapabilitiesDtoSchema.safeParse({ ...selfHosted, compareEditionsUrl: '/editions' })
        .success,
    ).toBe(false)
  })

  it('is required on GET /api/v1/me', () => {
    expect(meDtoSchema.shape.install).toBe(installCapabilitiesDtoSchema)
    expect(INSTALL_CAPABILITIES).toEqual(['licenseManagement', 'planBilling'])
  })
})
