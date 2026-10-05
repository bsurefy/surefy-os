// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, it } from 'vitest'

import {
  hoursToSessionLength,
  isTwoFactorTurnedOn,
  sessionLengthToHours,
  toSecuritySettingsValues,
} from './SecuritySettings.utils'
import { organizationFactory } from '../../../../mock/handlers/organizations'

describe('session length', () => {
  it('maps picker values to hours and back', () => {
    expect(sessionLengthToHours('default')).toBeNull()
    expect(sessionLengthToHours('24')).toBe(24)
    expect(hoursToSessionLength(168)).toBe('168')
    expect(hoursToSessionLength(null)).toBe('default')
  })

  it('shows a length the picker does not offer as the default', () => {
    expect(hoursToSessionLength(5)).toBe('default')
  })
})

describe('isTwoFactorTurnedOn', () => {
  const organization = organizationFactory()

  it('is true only when the requirement goes from off to on', () => {
    const values = toSecuritySettingsValues(organization)
    expect(isTwoFactorTurnedOn(organization, { ...values, require2fa: true })).toBe(true)
    expect(isTwoFactorTurnedOn(organization, values)).toBe(false)
  })
})
