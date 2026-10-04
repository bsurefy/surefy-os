// SPDX-License-Identifier: AGPL-3.0-only
import { z } from 'zod'

import { localeSchema } from '../core/locales.js'
import { ORG_ROLES, PARTNER_ROLES, PLATFORM_ROLES } from '../core/roles.js'
import { organizationRefDtoSchema } from '../organizations/schemas.js'

// Better Auth owns sign-up, sign-in, sign-out, verification, password reset and two-factor under
// `/api/auth/*`. These are the endpoints SurefyOS adds (backend/authentication.md §4):
// GET/PATCH /api/v1/me · GET /api/v1/me/sessions · DELETE /api/v1/me/sessions/:sessionId ·
// POST /api/v1/me/sessions/revoke-others · GET /api/v1/auth/options (public).
// Tables: users, sessions, user_preferences (database/identity-and-auth.md).

/** Better Auth `minPasswordLength` is 12; the upper bound protects the hash function. */
export const PASSWORD_LENGTH = { min: 12, max: 128 } as const
export const passwordSchema = z.string().min(PASSWORD_LENGTH.min).max(PASSWORD_LENGTH.max)

/** Emails are stored lowercase; the schema normalizes before the format check. */
export const emailSchema = z.string().trim().toLowerCase().max(254).pipe(z.email())
export const personNameSchema = z.string().trim().min(1).max(120)

export const THEMES = ['light', 'dark', 'system'] as const
export type Theme = (typeof THEMES)[number]

/** The app a session was created for (`sessions.app`); custom domains map to `workspace`. */
export const SESSION_APPS = ['workspace', 'console', 'partner'] as const
export type SessionApp = (typeof SESSION_APPS)[number]

/** `users.disabled_reason`; never shown to the person, only to staff and install administrators. */
export const USER_DISABLED_REASONS = [
  'security_lock',
  'policy_violation',
  'owner_request',
  'other',
] as const
export type UserDisabledReason = (typeof USER_DISABLED_REASONS)[number]

/** OAuth sign-in providers an install can enable (each needs its client id and secret). */
export const OAUTH_PROVIDERS = ['google', 'microsoft', 'github'] as const
export type OauthProvider = (typeof OAUTH_PROVIDERS)[number]

/** A person as they see themselves. `imageUrl` is a short-lived signed URL of the stored avatar. */
export const userDtoSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  email: z.string(),
  emailVerified: z.boolean(),
  imageUrl: z.url().nullable(),
  twoFactorEnabled: z.boolean(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
})
export type UserDto = z.infer<typeof userDtoSchema>

/** A person as other DTOs embed them (members, team members, actors). */
export const userRefDtoSchema = userDtoSchema.pick({
  id: true,
  name: true,
  email: true,
  imageUrl: true,
})
export type UserRefDto = z.infer<typeof userRefDtoSchema>

/** `user_preferences`; a missing row means every value null or its default. */
export const userPreferencesDtoSchema = z.object({
  locale: localeSchema.nullable(),
  theme: z.enum(THEMES),
  timezone: z.string().nullable(),
  lastOrganizationId: z.uuid().nullable(),
})
export type UserPreferencesDto = z.infer<typeof userPreferencesDtoSchema>

/** One signed-in session of the current user ("Signed-in devices"). */
export const sessionDtoSchema = z.object({
  id: z.uuid(),
  app: z.enum(SESSION_APPS),
  ipAddress: z.string().nullable(),
  userAgent: z.string().nullable(),
  isCurrent: z.boolean(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  expiresAt: z.iso.datetime(),
})
export type SessionDto = z.infer<typeof sessionDtoSchema>

export const sessionParamsSchema = z.object({ sessionId: z.uuid() })
export type SessionParams = z.infer<typeof sessionParamsSchema>

/** An active membership of the current user; deactivated memberships are not listed. */
export const meMembershipDtoSchema = z.object({
  organization: organizationRefDtoSchema,
  role: z.enum(ORG_ROLES),
  primaryTeamId: z.uuid().nullable(),
  joinedAt: z.iso.datetime(),
})
export type MeMembershipDto = z.infer<typeof meMembershipDtoSchema>

/**
 * Platform (BSurefy staff) role of the current user; Cloud only, otherwise null. Platform permission
 * keys are defined by the Cloud edition, so they cross the wire as plain strings.
 */
export const mePlatformDtoSchema = z.object({
  role: z.enum(PLATFORM_ROLES),
  permissions: z.array(z.string()),
})
export type MePlatformDto = z.infer<typeof mePlatformDtoSchema>

/** A partner membership of the current user; Cloud only, otherwise an empty list. */
export const mePartnerDtoSchema = z.object({
  partner: z.object({ id: z.uuid(), name: z.string(), slug: z.string() }),
  role: z.enum(PARTNER_ROLES),
  permissions: z.array(z.string()),
})
export type MePartnerDto = z.infer<typeof mePartnerDtoSchema>

export const ACCESS_GRANT_VIAS = ['support', 'partner'] as const
export type AccessGrantVia = (typeof ACCESS_GRANT_VIAS)[number]
export const ACCESS_GRANT_SCOPES = ['read_only', 'write'] as const
export type AccessGrantScope = (typeof ACCESS_GRANT_SCOPES)[number]

/**
 * An active customer-approved access grant on one of the user's organizations (Cloud; ADR 0015).
 * Drives the non-dismissible support or partner access banner. `partnerName` is set for `partner`.
 */
export const supportAccessNoticeDtoSchema = z.object({
  grantId: z.uuid(),
  organizationId: z.uuid(),
  via: z.enum(ACCESS_GRANT_VIAS),
  scope: z.enum(ACCESS_GRANT_SCOPES),
  reason: z.string(),
  partnerName: z.string().nullable(),
  startedAt: z.iso.datetime(),
  endsAt: z.iso.datetime(),
})
export type SupportAccessNoticeDto = z.infer<typeof supportAccessNoticeDtoSchema>

/**
 * `GET /api/v1/me`: the signed-in person, their preferences, the session in use, every active
 * membership, platform and partner roles, active access grants and what they may do outside an
 * organization. The "Choose organization" and "No organization" screens read `memberships` and
 * `preferences.lastOrganizationId`.
 */
export const meDtoSchema = z.object({
  user: userDtoSchema,
  preferences: userPreferencesDtoSchema,
  session: z.object({
    id: z.uuid(),
    app: z.enum(SESSION_APPS),
    createdAt: z.iso.datetime(),
    expiresAt: z.iso.datetime(),
  }),
  memberships: z.array(meMembershipDtoSchema),
  platform: mePlatformDtoSchema.nullable(),
  partners: z.array(mePartnerDtoSchema),
  supportAccess: z.array(supportAccessNoticeDtoSchema),
  /** Row in `install_admins`: shows Settings › Install and License on self-hosted installs. */
  isInstallAdmin: z.boolean(),
  /** The install's organization limit and creation policy allow this person to create one. */
  canCreateOrganization: z.boolean(),
})
export type MeDto = z.infer<typeof meDtoSchema>

/**
 * `PATCH /api/v1/me`: profile and personal preferences. Email and password changes go through
 * Better Auth; the avatar is a separate multipart upload.
 */
export const updateMeInputSchema = z.object({
  name: personNameSchema.optional(),
  locale: localeSchema.nullable().optional(),
  theme: z.enum(THEMES).optional(),
  timezone: z.string().trim().min(1).max(64).nullable().optional(),
  lastOrganizationId: z.uuid().nullable().optional(),
})
export type UpdateMeInput = z.infer<typeof updateMeInputSchema>

/** `POST /api/v1/me/sessions/revoke-others` ("Sign out everywhere else"): how many sessions ended. */
export const revokeOtherSessionsResultDtoSchema = z.object({
  revoked: z.number().int().nonnegative(),
})
export type RevokeOtherSessionsResultDto = z.infer<typeof revokeOtherSessionsResultDtoSchema>

/**
 * `GET /api/v1/auth/options` (public): what the sign-in and sign-up screens offer on this install.
 * OAuth providers appear only when enabled in install settings and configured in the environment.
 */
export const signInOptionsDtoSchema = z.object({
  emailPassword: z.boolean(),
  oauthProviders: z.array(z.enum(OAUTH_PROVIDERS)),
  /** Install sign-up policy is `open`; on Cloud always true. */
  signupOpen: z.boolean(),
  /** Product version shown in the sign-in footer. */
  version: z.string(),
})
export type SignInOptionsDto = z.infer<typeof signInOptionsDtoSchema>
