// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, it } from 'vitest'

import { getTimeZones, isSupportedTimeZone } from './GeneralSettings.utils'

describe('time zones', () => {
  it('accepts UTC, which a browser set to UTC reports and setup stores', () => {
    expect(getTimeZones()).toContain('UTC')
    expect(isSupportedTimeZone('UTC')).toBe(true)
  })

  it('lists each zone once and refuses a zone that does not exist', () => {
    const zones = getTimeZones()
    expect(new Set(zones).size).toBe(zones.length)
    expect(isSupportedTimeZone('Europe/Berlin')).toBe(true)
    expect(isSupportedTimeZone('Mars/Olympus')).toBe(false)
  })
})
