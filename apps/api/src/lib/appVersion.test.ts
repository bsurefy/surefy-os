// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, it } from 'vitest'

import { APP_VERSION } from './appVersion.js'

describe('APP_VERSION', () => {
  it('is the version of the API package', () => {
    expect(APP_VERSION).toMatch(/^\d+\.\d+\.\d+/)
  })
})
