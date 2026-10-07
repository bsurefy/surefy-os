// SPDX-License-Identifier: AGPL-3.0-only
// The people and organizations the shell's mock domains share (me, access, notifications).
import type { MeDto, MeMembershipDto } from '@surefy/contracts'
import {
  fixtureUuid,
  installCapabilitiesFactory,
  meFactory,
  meMembershipFactory,
} from '@surefy/web-core/testing'

export const ACME_ORG = {
  id: fixtureUuid(2, 1),
  name: 'Acme Logistics',
  slug: 'acme',
  logoUrl: null,
  status: 'active',
} as const satisfies MeMembershipDto['organization']

const GLOBEX_ORG = {
  id: fixtureUuid(2, 2),
  name: 'Globex Support',
  slug: 'globex',
  logoUrl: null,
  status: 'active',
} as const satisfies MeMembershipDto['organization']

export const MAYA = {
  id: fixtureUuid(1, 1),
  name: 'Maya Okafor',
  email: 'maya@acme.test',
  imageUrl: null,
}

export const OMAR = {
  id: fixtureUuid(1, 2),
  name: 'Omar Haddad',
  email: 'omar@acme.test',
  imageUrl: null,
}

/** A self-hosted Community install with one organization, where Maya is Owner and install admin. */
export function shellMe(): MeDto {
  const base = meFactory()
  return {
    ...base,
    user: { ...base.user, ...MAYA },
    memberships: [meMembershipFactory({ organization: ACME_ORG, role: 'owner' })],
    isInstallAdmin: true,
  }
}

/** Enterprise with several organizations: Owner in Acme, Builder in Globex, may create more. */
export function multiOrgMe(): MeDto {
  return {
    ...shellMe(),
    memberships: [
      meMembershipFactory({ organization: ACME_ORG, role: 'owner' }),
      meMembershipFactory({ organization: GLOBEX_ORG, role: 'builder' }),
    ],
    canCreateOrganization: true,
  }
}

/** Cloud: plans and credits instead of licenses; no install administration. */
export function cloudMe(): MeDto {
  return {
    ...shellMe(),
    isInstallAdmin: false,
    install: installCapabilitiesFactory({
      licenseManagement: false,
      planBilling: true,
      hosting: 'cloud',
      compareEditionsUrl: null,
    }),
  }
}

/**
 * The shell's own domains answer the failure scenarios with their default data: the scenario
 * cookie applies to every request, and the page under test, not the shell, should show it.
 */
export function shellSafe(
  resolver: () => Response,
): Record<'error' | 'forbidden' | 'gated' | 'limit' | 'offline' | 'empty', () => Response> {
  return {
    error: resolver,
    forbidden: resolver,
    gated: resolver,
    limit: resolver,
    offline: resolver,
    empty: resolver,
  }
}
