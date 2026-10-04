// SPDX-License-Identifier: AGPL-3.0-only
import { ROUTES, SETTINGS_SECTION } from '@/constants/routes'
import type { InstallCapabilitiesDto } from '@surefy/contracts'
import { getUpgradeLinks } from '@surefy/web-core/access'
import type { UpgradeLinks } from '@surefy/web-core/access'

/**
 * The upgrade card's links inside one organization, from `session.install` (ADR 0020): Settings ›
 * License where the install manages licenses, Settings › Billing & credits where it sells plans,
 * and the editions page as returned. The organization layout passes them to
 * `UpgradeLinksProvider`; the card itself never knows the edition or the deployment.
 */
export function getWorkspaceUpgradeLinks(
  install: InstallCapabilitiesDto,
  orgSlug: string,
): UpgradeLinks {
  return getUpgradeLinks(install, {
    licenseHref: ROUTES.workspace.settings(orgSlug, SETTINGS_SECTION.LICENSE),
    plansHref: ROUTES.workspace.settings(orgSlug, SETTINGS_SECTION.BILLING),
  })
}
