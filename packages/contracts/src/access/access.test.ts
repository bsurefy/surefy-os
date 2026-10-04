// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, it } from 'vitest'

import { accessPolicySchema, MODULES } from '../index.js'

describe('access policy', () => {
  it('reads { version: 1 } as "no restrictions"', () => {
    expect(accessPolicySchema.parse({ version: 1 })).toEqual({ version: 1 })
  })

  it('accepts known modules and rejects unknown ones and other versions', () => {
    expect(accessPolicySchema.safeParse({ version: 1, modules: [MODULES[0]] }).success).toBe(true)
    expect(accessPolicySchema.safeParse({ version: 1, modules: ['nope'] }).success).toBe(false)
    expect(accessPolicySchema.safeParse({ version: 2 }).success).toBe(false)
  })
})
