// SPDX-License-Identifier: AGPL-3.0-only
import type { Entitlements, InstallCapabilitiesDto, LicenseStatusDto } from '@surefy/contracts'

import type { ActorContext, EffectiveAccess } from '@/types/context.js'

/**
 * What an entitlement source grants one organization at the top of the access chain: modules,
 * features and limits, plus the license state the source computes from its dates. During a
 * license's grace days `readOnly` is true and every feature becomes read-only.
 */
export interface EntitlementGrant extends Entitlements {
  license: LicenseStatusDto | null
  readOnly: boolean
}

/**
 * The top of the access chain (extensions.md, §3; ADR 0020). Community's is built in; a verified
 * license (`ee-api`) or the Cloud plans (`cloud-api`) replace it through `setEntitlementSource`.
 */
export interface EntitlementSource {
  readonly name: 'community' | 'license' | 'plan'
  /** Features and limits granted at the top level (before partner/org/team narrowing). */
  getEntitlements(scope: { orgId: string }): Promise<EntitlementGrant>
  /** Limits for the whole install, e.g. how many organizations it may hold (null = unlimited). */
  getInstallLimits(): Promise<{ maxOrganizations: number | null }>
  /** What the install offers: license management, plan billing, hosting, the editions page. */
  getInstallCapabilities(): InstallCapabilitiesDto
}

/** What an access check sees: who acts, where, and their effective access there. */
export interface AccessCheckInput {
  actor: ActorContext
  orgId: string
  access: EffectiveAccess
}

/**
 * A per-request organization check after the tenant is known (for example an IP allow-list). It
 * throws an `AppError` to refuse the request; it never widens access.
 */
export interface AccessCheck {
  readonly name: string
  check(input: AccessCheckInput): Promise<void>
}
