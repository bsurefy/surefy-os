// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, it } from 'vitest'
import { z } from 'zod'

import { uuidv7 } from './uuidv7.js'

describe('uuidv7', () => {
  it('is a version 7 UUID that starts with the time in milliseconds', () => {
    const id = uuidv7(0x0190_1234_5678)
    expect(z.uuid().safeParse(id).success).toBe(true)
    expect(id.startsWith('01901234-5678-7')).toBe(true)
    expect(['8', '9', 'a', 'b']).toContain(id.charAt(19))
  })

  it('sorts by time', () => {
    expect(uuidv7(1_000) < uuidv7(2_000)).toBe(true)
  })
})
