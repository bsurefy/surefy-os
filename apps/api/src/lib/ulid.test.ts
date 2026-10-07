// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, it } from 'vitest'

import { ulid, ULID_PATTERN } from './ulid.js'

describe('ulid', () => {
  it('produces 26 Crockford base32 characters', () => {
    const id = ulid()
    expect(id).toHaveLength(26)
    expect(id).toMatch(ULID_PATTERN)
  })

  it('sorts by time', () => {
    const earlier = ulid(1_700_000_000_000)
    const later = ulid(1_700_000_000_001)
    expect(earlier.slice(0, 10) < later.slice(0, 10)).toBe(true)
    expect(earlier.slice(0, 10)).toBe(ulid(1_700_000_000_000).slice(0, 10))
  })

  it('does not repeat', () => {
    const ids = new Set(Array.from({ length: 1000 }, () => ulid()))
    expect(ids.size).toBe(1000)
  })
})
