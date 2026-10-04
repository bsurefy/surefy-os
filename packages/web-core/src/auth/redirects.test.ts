// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, it } from 'vitest'

import { getSafeRedirect } from './redirects'

const FALLBACK = '/organizations'

describe('getSafeRedirect', () => {
  it.each(['/acme/agents', '/acme/agents?tab=runs#top', '/'])(
    'keeps the same-origin path %s',
    (target) => {
      expect(getSafeRedirect(target, FALLBACK)).toBe(target)
    },
  )

  it.each([
    'https://evil.test/acme',
    '//evil.test',
    '/\\evil.test',
    'javascript:alert(1)',
    'acme/agents',
    '',
    undefined,
    ['/acme'],
  ])('falls back for %s', (target) => {
    expect(getSafeRedirect(target, FALLBACK)).toBe(FALLBACK)
  })
})
