// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, it } from 'vitest'

import { selectMockDomains } from '@surefy/web-core/testing/mock'

import { mockDomains } from '.'

describe('the mock domain registry', () => {
  it('registers every domain once, so MOCK_DOMAINS can name any of them', () => {
    const names = mockDomains.map((domain) => domain.name)
    expect(new Set(names).size).toBe(names.length)
    expect(selectMockDomains(mockDomains, names).passthrough).toEqual([])
  })

  it('never registers sign-in or setup, which always use the real backend', () => {
    const names = mockDomains.map((domain) => domain.name)
    expect(names).not.toContain('auth')
    expect(names).not.toContain('setup')
  })
})
