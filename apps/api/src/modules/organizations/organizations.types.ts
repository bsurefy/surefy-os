// SPDX-License-Identifier: AGPL-3.0-only
import type { LimitReachedDetail, OrganizationStatus, ProvisioningSource } from '@surefy/contracts'

import type { DbTransaction } from '@/core/database/index.js'

/** What the service needs from the request: the verified organization and who acts. */
export interface OrganizationContext {
  orgId: string
  userId: string | null
}

/**
 * Writes the creator's Owner membership in the creating transaction. The members module
 * implements it; the organizations module never touches `organization_members` itself.
 */
export interface OrganizationOwnerWriter {
  insertOwnerInTx(
    tx: DbTransaction,
    input: { orgId: string; userId: string; provisioningSource: ProvisioningSource },
  ): Promise<{ memberId: string }>
}

/**
 * The install-level limits of the active entitlement source (extensions.md, §3; ADR 0016). The
 * access module's `EntitlementSource` satisfies it; until then the Community default applies.
 */
export interface InstallLimitsSource {
  name: Extract<LimitReachedDetail['source'], 'community' | 'license' | 'plan'>
  getInstallLimits(): Promise<{ maxOrganizations: number | null }>
}

/**
 * Who may create an organization beyond the first (`install_settings.org_creation_policy`). The
 * install module provides it; until then nobody may.
 */
export interface OrganizationCreationRule {
  mayCreateOrganization(userId: string): Promise<boolean>
}

/** The person who becomes the first Owner of a new organization, and how they arrived. */
export interface OrganizationOwner {
  userId: string
  provisioningSource: ProvisioningSource
}

export interface CreateOrganizationOptions {
  /**
   * Guided setup creates the first organization without the organization limit (ADR 0016);
   * every other creation enforces it.
   */
  enforceLimit?: boolean
}

/** What the access check reads on every request, inside its tenant transaction. */
export interface OrganizationAccessHeader {
  status: OrganizationStatus
  /** `organizations.access_version`: part of the effective access cache key. */
  accessVersion: number
  /** `settings.security.require2fa`: members without two-factor are refused. */
  require2fa: boolean
}
