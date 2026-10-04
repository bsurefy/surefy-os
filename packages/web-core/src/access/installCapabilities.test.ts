// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, it } from 'vitest'

import { getUpgradeLinks, hasInstallCapability } from './installCapabilities'
import { FIXTURE_COMPARE_EDITIONS_URL, installCapabilitiesFactory } from '../testing'

const HREFS = { licenseHref: '/acme/settings/license', plansHref: '/acme/settings/billing' }
const CLOUD = {
  licenseManagement: false,
  planBilling: true,
  hosting: 'cloud',
  compareEditionsUrl: null,
} as const

describe('hasInstallCapability', () => {
  it('answers from the capability booleans of the install', () => {
    const selfHosted = installCapabilitiesFactory()
    const cloud = installCapabilitiesFactory(CLOUD)

    expect(hasInstallCapability(selfHosted, 'licenseManagement')).toBe(true)
    expect(hasInstallCapability(selfHosted, 'planBilling')).toBe(false)
    expect(hasInstallCapability(cloud, 'licenseManagement')).toBe(false)
    expect(hasInstallCapability(cloud, 'planBilling')).toBe(true)
  })
})

describe('getUpgradeLinks', () => {
  it('offers the license and the editions page on a self-hosted install', () => {
    expect(getUpgradeLinks(installCapabilitiesFactory(), HREFS)).toEqual({
      compareEditionsUrl: FIXTURE_COMPARE_EDITIONS_URL,
      licenseHref: HREFS.licenseHref,
      plansHref: undefined,
    })
  })

  it('offers only the plans on Cloud', () => {
    expect(getUpgradeLinks(installCapabilitiesFactory(CLOUD), HREFS)).toEqual({
      compareEditionsUrl: undefined,
      licenseHref: undefined,
      plansHref: HREFS.plansHref,
    })
  })
})
