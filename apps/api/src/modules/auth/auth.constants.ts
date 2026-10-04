// SPDX-License-Identifier: AGPL-3.0-only
import type { InstallCapabilitiesDto } from '@surefy/contracts'

import type {
  InstallAdminsReader,
  InstallCapabilitiesSource,
  MembershipsReader,
  OrganizationCreationPolicy,
  SignupStatus,
} from './auth.types.js'
import type { SignupPolicy } from '@/core/auth/index.js'

/** "Signed-in devices" lists at most this many sessions, newest first (api.md: documented cap). */
export const MAX_LISTED_SESSIONS = 100

/** The public page that compares the editions (ADR 0020): a constant, never an environment variable. */
export const COMPARE_EDITIONS_URL = 'https://surefyos.com/editions'

/**
 * Install capabilities of the built-in Community entitlement source (ADR 0020, extensions.md §3):
 * licenses can be entered, nothing is billed here, the data stays on the install's server.
 */
export const COMMUNITY_INSTALL_CAPABILITIES: InstallCapabilitiesDto = Object.freeze({
  licenseManagement: true,
  planBilling: false,
  hosting: 'self-hosted',
  compareEditionsUrl: COMPARE_EDITIONS_URL,
})

/**
 * Community defaults until the owning modules are wired: no memberships, no install
 * administrators, no organization creation, invitation-only sign-up (`signup_policy` defaults to
 * `invite_only`), and the Community install capabilities.
 */
export const AUTH_DEFAULTS = {
  memberships: { listActiveMemberships: () => Promise.resolve([]) } satisfies MembershipsReader,
  installAdmins: { isInstallAdmin: () => Promise.resolve(false) } satisfies InstallAdminsReader,
  organizationCreation: {
    canCreateOrganization: () => Promise.resolve(false),
  } satisfies OrganizationCreationPolicy,
  installCapabilities: {
    getInstallCapabilities: () => COMMUNITY_INSTALL_CAPABILITIES,
  } satisfies InstallCapabilitiesSource,
  signup: {
    allows: () => Promise.resolve(false),
    isSignupOpen: () => Promise.resolve(false),
  } satisfies SignupPolicy & SignupStatus,
} as const
