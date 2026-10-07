// SPDX-License-Identifier: AGPL-3.0-only
import { COMMUNITY_INSTALL_LIMITS } from '@surefy/contracts'

import type { InstallLimitsSource, OrganizationCreationRule } from './organizations.types.js'

/** A retired slug keeps redirecting for this long (organizations-and-members.md, §2). */
export const SLUG_REDIRECT_DAYS = 90

/** Logo links are short-lived signed URLs, like avatars. */
export const LOGO_URL_TTL_SECONDS = 15 * 60

/** The advisory lock every organization creation takes before counting (ADR 0016). */
export const ORGANIZATION_CREATE_LOCK = 'organization_create'

/**
 * Community defaults until the owning modules are wired: one organization per install (ADR
 * 0016), and nobody may create another one (the install module provides the creation policy).
 */
export const ORGANIZATIONS_DEFAULTS = {
  installLimits: {
    name: 'community',
    getInstallLimits: () =>
      Promise.resolve({ maxOrganizations: COMMUNITY_INSTALL_LIMITS.maxOrganizations }),
  } satisfies InstallLimitsSource,
  creationRule: {
    mayCreateOrganization: () => Promise.resolve(false),
  } satisfies OrganizationCreationRule,
} as const
