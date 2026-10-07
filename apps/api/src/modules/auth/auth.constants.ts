// SPDX-License-Identifier: AGPL-3.0-only
import type {
  InstallAdminsReader,
  MembershipsReader,
  OrganizationCreationPolicy,
  SignupStatus,
} from './auth.types.js'
import type { SignupPolicy } from '@/core/auth/index.js'

/** "Signed-in devices" lists at most this many sessions, newest first (api.md: documented cap). */
export const MAX_LISTED_SESSIONS = 100

/**
 * Community defaults until the owning modules are wired: no memberships, no install
 * administrators, no organization creation, and invitation-only sign-up (`signup_policy` defaults
 * to `invite_only`). Install capabilities always come from the access module's entitlement source.
 */
export const AUTH_DEFAULTS = {
  memberships: { listActiveMemberships: () => Promise.resolve([]) } satisfies MembershipsReader,
  installAdmins: { isInstallAdmin: () => Promise.resolve(false) } satisfies InstallAdminsReader,
  organizationCreation: {
    canCreateOrganization: () => Promise.resolve(false),
  } satisfies OrganizationCreationPolicy,
  signup: {
    allows: () => Promise.resolve(false),
    isSignupOpen: () => Promise.resolve(false),
  } satisfies SignupPolicy & SignupStatus,
} as const
