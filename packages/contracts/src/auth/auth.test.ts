// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, it } from 'vitest'

import { emailSchema, passwordSchema, PASSWORD_LENGTH, updateMeInputSchema } from '../index.js'

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
