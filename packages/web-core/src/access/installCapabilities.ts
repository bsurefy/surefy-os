// SPDX-License-Identifier: AGPL-3.0-only
import type { InstallCapabilitiesDto, InstallCapability } from '@surefy/contracts'

import type { UpgradeLinks } from './UpgradeLinksProvider'

/**
 * Whether the install offers `capability` (`session.install`, ADR 0020): navigation items and
 * install-level screens declare the one they need. `hosting` is not a capability and never gates.
 */
export function hasInstallCapability(
  install: InstallCapabilitiesDto,
  capability: InstallCapability,
): boolean {
  return install[capability]
}

/** The app's own paths for the upgrade card's in-app actions. */
export interface UpgradeHrefs {
  /** Settings › License. */
  licenseHref: string
  /** Settings › Billing & credits. */
  plansHref: string
}

/**
 * The upgrade card's links for this install, built by the app's server layout: the license link
 * when the install manages licenses, the plans link when it sells plans, the editions page as
 * returned. The card then applies its person rules (install administrator, `billing:manage`).
 */
export function getUpgradeLinks(
  install: InstallCapabilitiesDto,
  hrefs: UpgradeHrefs,
): UpgradeLinks {
  return {
    compareEditionsUrl: install.compareEditionsUrl ?? undefined,
    licenseHref: install.licenseManagement ? hrefs.licenseHref : undefined,
    plansHref: install.planBilling ? hrefs.plansHref : undefined,
  }
}
