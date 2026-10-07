// SPDX-License-Identifier: AGPL-3.0-only
import {
  COMMUNITY_ENTITLEMENTS,
  COMMUNITY_INSTALL_LIMITS,
  type InstallCapabilitiesDto,
} from '@surefy/contracts'

import { COMPARE_EDITIONS_URL } from './access.constants.js'

import type { EntitlementGrant, EntitlementSource } from './entitlements.types.js'
import type { ExtensionRegistry } from '@/core/extensions/index.js'

/**
 * Install capabilities of the built-in Community source (ADR 0020, extensions.md §3): licenses
 * can be entered, nothing is billed here, the data stays on the install's server.
 */
export const COMMUNITY_INSTALL_CAPABILITIES: InstallCapabilitiesDto = Object.freeze({
  licenseManagement: true,
  planBilling: false,
  hosting: 'self-hosted',
  compareEditionsUrl: COMPARE_EDITIONS_URL,
})

const COMMUNITY_GRANT: EntitlementGrant = Object.freeze({
  modules: COMMUNITY_ENTITLEMENTS.modules,
  features: COMMUNITY_ENTITLEMENTS.features,
  limits: COMMUNITY_ENTITLEMENTS.limits,
  license: null,
  readOnly: false,
})

/** Community: every module, no Enterprise features, no numeric limits, one organization. */
export class CommunityEntitlements implements EntitlementSource {
  readonly name = 'community'

  getEntitlements(): Promise<EntitlementGrant> {
    return Promise.resolve(COMMUNITY_GRANT)
  }

  getInstallLimits(): Promise<{ maxOrganizations: number | null }> {
    return Promise.resolve({ maxOrganizations: COMMUNITY_INSTALL_LIMITS.maxOrganizations })
  }

  getInstallCapabilities(): InstallCapabilitiesDto {
    return COMMUNITY_INSTALL_CAPABILITIES
  }
}

/**
 * The active entitlement source, read at call time: an extension's (`setEntitlementSource`, which
 * runs after the modules are built) or Community's. The container hands this one object to every
 * module that needs install limits, capabilities or entitlements.
 */
export function createEntitlementSource(
  hooks: Pick<ExtensionRegistry, 'entitlementSource'>,
): EntitlementSource {
  const community = new CommunityEntitlements()
  const current = (): EntitlementSource => hooks.entitlementSource() ?? community
  return {
    get name() {
      return current().name
    },
    getEntitlements: (scope) => current().getEntitlements(scope),
    getInstallLimits: () => current().getInstallLimits(),
    getInstallCapabilities: () => current().getInstallCapabilities(),
  }
}
