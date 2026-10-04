// SPDX-License-Identifier: AGPL-3.0-only
import { z } from 'zod'

import { emailSchema, OAUTH_PROVIDERS, userRefDtoSchema } from '../auth/schemas.js'
import { pageQuery } from '../core/pagination.js'
import { organizationRefDtoSchema } from '../organizations/schemas.js'

// Install-wide settings and administrators of a self-hosted install (Settings › Install).
// Tables: install_settings (singleton), install_admins (database/organizations-and-members.md).
// Routes: GET/PATCH /api/v1/install/settings · POST /api/v1/install/smtp/test (204) ·
// GET/POST /api/v1/install/admins · DELETE /api/v1/install/admins/:userId ·
// GET /api/v1/install/organizations. Guard: membership in `install_admins`, no org permission.

export const INSTALL_SIGNUP_POLICIES = ['invite_only', 'open'] as const
export type InstallSignupPolicy = (typeof INSTALL_SIGNUP_POLICIES)[number]

/** Applies only when the install may hold more than one organization (`multi-organization`). */
export const INSTALL_ORG_CREATION_POLICIES = ['install_admins', 'any_user'] as const
export type InstallOrgCreationPolicy = (typeof INSTALL_ORG_CREATION_POLICIES)[number]

/** SMTP settings without the password, which lives in encrypted columns. */
export const smtpSettingsSchema = z.object({
  host: z.string().trim().min(1).max(253),
  port: z.number().int().min(1).max(65_535),
  secure: z.boolean(),
  username: z.string().trim().max(254).nullable(),
  fromAddress: emailSchema,
  fromName: z.string().trim().max(120).nullable(),
})
export type SmtpSettings = z.infer<typeof smtpSettingsSchema>

const oauthFlagsSchema = z.object({
  google: z.boolean().default(false),
  microsoft: z.boolean().default(false),
  github: z.boolean().default(false),
})
const searxngUrlSchema = z.url().nullable()

/** `InstallSettings` v1: the `install_settings.settings` JSONB. Stored sparse, read with defaults. */
export const installSettingsSchema = z.object({
  version: z.literal(1),
  signIn: z
    .object({
      emailPassword: z.boolean().default(true),
      oauth: oauthFlagsSchema.prefault({}),
    })
    .prefault({}),
  smtp: smtpSettingsSchema.nullable().default(null),
  webSearch: z.object({ searxngUrl: searxngUrlSchema.default(null) }).prefault({}),
})
export type InstallSettings = z.infer<typeof installSettingsSchema>

/** An OAuth provider's state: switched on in settings, and configured (client id and secret) in the environment. */
export const oauthProviderStateDtoSchema = z.object({
  enabled: z.boolean(),
  configured: z.boolean(),
})
export type OauthProviderStateDto = z.infer<typeof oauthProviderStateDtoSchema>

/** `GET /api/v1/install/settings`. */
export const installSettingsDtoSchema = z.object({
  installationId: z.uuid(),
  version: z.object({
    current: z.string(),
    /** Latest published version when the update check ran; null when unknown or disabled. */
    latest: z.string().nullable(),
  }),
  setupCompletedAt: z.iso.datetime().nullable(),
  signupPolicy: z.enum(INSTALL_SIGNUP_POLICIES),
  orgCreationPolicy: z.enum(INSTALL_ORG_CREATION_POLICIES),
  organizations: z.object({
    count: z.number().int().nonnegative(),
    /** `maxOrganizations` of the entitlement source; null = unlimited. */
    max: z.number().int().positive().nullable(),
  }),
  signIn: z.object({
    emailPassword: z.boolean(),
    oauth: z.record(z.enum(OAUTH_PROVIDERS), oauthProviderStateDtoSchema),
  }),
  smtp: smtpSettingsSchema.extend({ passwordSet: z.boolean() }).nullable(),
  webSearch: z.object({ searxngUrl: searxngUrlSchema }),
  updatedAt: z.iso.datetime(),
})
export type InstallSettingsDto = z.infer<typeof installSettingsDtoSchema>

/**
 * `PATCH /api/v1/install/settings`. `smtp` replaces the whole SMTP block (null switches email off);
 * inside it, an absent `password` keeps the stored one and null clears it.
 */
export const updateInstallSettingsInputSchema = z.object({
  signupPolicy: z.enum(INSTALL_SIGNUP_POLICIES).optional(),
  orgCreationPolicy: z.enum(INSTALL_ORG_CREATION_POLICIES).optional(),
  signIn: z
    .object({
      emailPassword: z.boolean().optional(),
      oauth: oauthFlagsSchema.partial().optional(),
    })
    .optional(),
  smtp: smtpSettingsSchema
    .extend({ password: z.string().min(1).max(512).nullable().optional() })
    .nullable()
    .optional(),
  webSearch: z.object({ searxngUrl: searxngUrlSchema }).optional(),
})
export type UpdateInstallSettingsInput = z.infer<typeof updateInstallSettingsInputSchema>

/** `POST /api/v1/install/smtp/test`: sends one message with the stored settings; 204 on success. */
export const sendTestEmailInputSchema = z.object({ to: emailSchema })
export type SendTestEmailInput = z.infer<typeof sendTestEmailInputSchema>

/** `GET /api/v1/install/admins`. */
export const installAdminDtoSchema = z.object({
  user: userRefDtoSchema,
  grantedByUserId: z.uuid().nullable(),
  createdAt: z.iso.datetime(),
})
export type InstallAdminDto = z.infer<typeof installAdminDtoSchema>

/** `POST /api/v1/install/admins`: the person must already have an account. */
export const addInstallAdminInputSchema = z.object({ userId: z.uuid() })
export type AddInstallAdminInput = z.infer<typeof addInstallAdminInputSchema>

export const installAdminParamsSchema = z.object({ userId: z.uuid() })
export type InstallAdminParams = z.infer<typeof installAdminParamsSchema>

/** `GET /api/v1/install/organizations`: every organization on the install, counted against the limit. */
export const installOrganizationDtoSchema = organizationRefDtoSchema.extend({
  memberCount: z.number().int().nonnegative(),
  createdAt: z.iso.datetime(),
})
export type InstallOrganizationDto = z.infer<typeof installOrganizationDtoSchema>

export const listInstallOrganizationsQuerySchema = pageQuery
export type ListInstallOrganizationsQuery = z.infer<typeof listInstallOrganizationsQuerySchema>
