// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, it } from 'vitest'

import { mergeSettings, readSettings } from '../organizations.mapper.js'

describe('organization settings', () => {
  it('reads sparse settings with every default', () => {
    expect(readSettings({ version: 1 })).toEqual({
      version: 1,
      security: { require2fa: false, sessionMaxHours: null },
      privacy: { chatSharingEnabled: true },
      setup: { skippedSteps: [] },
    })
  })

  it('changes only the fields a PATCH names and keeps the rest sparse', () => {
    const stored = { version: 1 as const, security: { require2fa: true } }
    expect(mergeSettings(stored, { security: { sessionMaxHours: 8 }, setup: {} })).toEqual({
      version: 1,
      security: { require2fa: true, sessionMaxHours: 8 },
      setup: {},
    })
    expect(mergeSettings(stored, { security: { sessionMaxHours: null } }).security).toEqual({
      require2fa: true,
      sessionMaxHours: null,
    })
  })
})
