// SPDX-License-Identifier: AGPL-3.0-only
import type { InstallCapabilitiesDto, MeMembershipDto } from '@surefy/contracts'

// What `GET /api/v1/me` reads from the modules that own the data. The container passes each one
// from its module (`members`, `install`, `access`) as those modules land; until then the auth
// module uses the Community defaults in auth.constants.ts.

/** Active memberships of a person, from `organization_members` (members module). */
export interface MembershipsReader {
  listActiveMemberships(userId: string): Promise<MeMembershipDto[]>
}

/** Install administration (install module). */
export interface InstallAdminsReader {
  isInstallAdmin(userId: string): Promise<boolean>
}

/** The install's organization limit and creation policy (install and access modules). */
export interface OrganizationCreationPolicy {
  canCreateOrganization(userId: string): Promise<boolean>
}

/** What the install offers, from the active entitlement source (ADR 0020). */
export interface InstallCapabilitiesSource {
  getInstallCapabilities(): InstallCapabilitiesDto
}

/** Whether the public sign-up is open (install sign-up policy); reported by `/auth/options`. */
export interface SignupStatus {
  isSignupOpen(): Promise<boolean>
}

/** Pending invitations by address (members module): an invited person may always sign up. */
export interface PendingInvitationsReader {
  hasPendingInvitation(email: string): Promise<boolean>
}
