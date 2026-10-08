// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, it } from 'vitest'

import { API_KEY_SECRET_PATTERN } from '@surefy/contracts'

import { generateApiKey, hashApiKey, isExpired } from '../apiKeys.utils.js'

describe('generateApiKey', () => {
  it('makes `sk_` plus 43 base62 characters, with its prefix and sha256 hash', () => {
    const key = generateApiKey()
    expect(key.secret).toMatch(API_KEY_SECRET_PATTERN)
    expect(key.prefix).toBe(key.secret.slice(0, 11))
    expect(key.hash).toHaveLength(32)
    expect(key.hash.equals(hashApiKey(key.secret))).toBe(true)
  })

  it('never repeats', () => {
    const secrets = new Set(Array.from({ length: 200 }, () => generateApiKey().secret))
    expect(secrets.size).toBe(200)
  })
})

describe('isExpired', () => {
  const now = new Date('2026-01-15T09:00:00.000Z')

  it('is false without a date and before it, true at and after it', () => {
    expect(isExpired(null, now)).toBe(false)
    expect(isExpired(new Date('2026-01-16T09:00:00.000Z'), now)).toBe(false)
    expect(isExpired(new Date('2026-01-15T09:00:00.000Z'), now)).toBe(true)
    expect(isExpired(new Date('2026-01-14T09:00:00.000Z'), now)).toBe(true)
  })
})
