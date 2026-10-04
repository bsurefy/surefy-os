// SPDX-License-Identifier: AGPL-3.0-only
import { z } from 'zod'

import { localeSchema } from '../core/locales.js'

// Tables: organizations, organization_slug_history (database/organizations-and-members.md).
// Routes: GET/PATCH /api/v1/orgs/:orgId · POST /api/v1/organizations ·
// GET /api/v1/organizations/slug-availability?slug= (public).

export const ORGANIZATION_STATUSES = ['active', 'suspended', 'deletion_scheduled'] as const
export type OrganizationStatus = (typeof ORGANIZATION_STATUSES)[number]

/** 3–48 characters, lowercase letters, digits and hyphens, no leading or trailing hyphen. */
export const ORGANIZATION_SLUG_PATTERN = /^[a-z0-9][a-z0-9-]{1,46}[a-z0-9]$/
export const ORGANIZATION_SLUG_LENGTH = { min: 3, max: 48 } as const

/** Slugs that would collide with workspace routes or read as official. Checked by the service. */
export const RESERVED_ORGANIZATION_SLUGS = [
  'admin',
  'api',
  'app',
  'auth',
  'bsurefy',
  'console',
  'forgot-password',
  'invite',
  'login',
  'logout',
  'no-organization',
  'organizations',
  'partner',
  'reset-password',
  'settings',
  'setup',
  'signup',
  'support',
  'surefy',
  'surefyos',
  'two-factor',
  'verify-email',
  'www',
] as const

export const organizationNameSchema = z.string().trim().min(1).max(100)
export const organizationSlugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(ORGANIZATION_SLUG_PATTERN)
/** IANA time zone name; the app validates it against the runtime's zone list. */
export const timezoneSchema = z.string().trim().min(1).max(64)
/** ISO 4217 code, stored uppercase. */
export const currencySchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z]{3}$/)

/** Steps of first-run setup; the Owner may skip the optional ones and the checklist offers them again. */
export const SETUP_STEPS = ['welcome', 'organization', 'model', 'safety', 'start', 'ready'] as const
export type SetupStep = (typeof SETUP_STEPS)[number]

/** Longest session an organization may require: 30 days (null = the app default). */
export const SESSION_MAX_HOURS = { min: 1, max: 720 } as const

// `OrganizationSettings` v1: the `organizations.settings` JSONB. Stored sparse, read with defaults.

const require2faSchema = z.boolean()
const sessionMaxHoursSchema = z
  .number()
  .int()
  .min(SESSION_MAX_HOURS.min)
  .max(SESSION_MAX_HOURS.max)
  .nullable()
const chatSharingEnabledSchema = z.boolean()
const skippedStepsSchema = z.array(z.enum(SETUP_STEPS)).max(SETUP_STEPS.length)

export const organizationSettingsSchema = z.object({
  version: z.literal(1),
  security: z
    .object({
      require2fa: require2faSchema.default(false),
      sessionMaxHours: sessionMaxHoursSchema.default(null),
    })
    .prefault({}),
  privacy: z.object({ chatSharingEnabled: chatSharingEnabledSchema.default(true) }).prefault({}),
  setup: z.object({ skippedSteps: skippedStepsSchema.default([]) }).prefault({}),
})
export type OrganizationSettings = z.infer<typeof organizationSettingsSchema>

/** Every field optional: a PATCH changes only what it names. */
export const updateOrganizationSettingsInputSchema = z.object({
  security: z
    .object({
      require2fa: require2faSchema.optional(),
      sessionMaxHours: sessionMaxHoursSchema.optional(),
    })
    .optional(),
  privacy: z.object({ chatSharingEnabled: chatSharingEnabledSchema.optional() }).optional(),
  setup: z.object({ skippedSteps: skippedStepsSchema.optional() }).optional(),
})
export type UpdateOrganizationSettingsInput = z.infer<typeof updateOrganizationSettingsInputSchema>

/** Shown to members of the organization. `logoUrl` is a short-lived signed URL, never the object key. */
export const organizationDtoSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  slug: z.string(),
  logoUrl: z.url().nullable(),
  timezone: z.string(),
  defaultLocale: localeSchema,
  currency: z.string(),
  status: z.enum(ORGANIZATION_STATUSES),
  suspendedAt: z.iso.datetime().nullable(),
  deletionRequestedAt: z.iso.datetime().nullable(),
  deletionScheduledFor: z.iso.datetime().nullable(),
  settings: organizationSettingsSchema,
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
})
export type OrganizationDto = z.infer<typeof organizationDtoSchema>

/** The organization as other DTOs embed it (memberships, invitations, install lists). */
export const organizationRefDtoSchema = organizationDtoSchema.pick({
  id: true,
  name: true,
  slug: true,
  logoUrl: true,
  status: true,
})
export type OrganizationRefDto = z.infer<typeof organizationRefDtoSchema>

/** `POST /api/v1/organizations`: allowed by the install's organization limit and creation policy. */
export const createOrganizationInputSchema = z.object({
  name: organizationNameSchema,
  slug: organizationSlugSchema,
  timezone: timezoneSchema.optional(),
  defaultLocale: localeSchema.optional(),
})
export type CreateOrganizationInput = z.infer<typeof createOrganizationInputSchema>

/** `PATCH /api/v1/orgs/:orgId` (Settings › General, Security, Data & privacy). A slug change is T2. */
export const updateOrganizationInputSchema = z.object({
  name: organizationNameSchema.optional(),
  slug: organizationSlugSchema.optional(),
  timezone: timezoneSchema.optional(),
  defaultLocale: localeSchema.optional(),
  currency: currencySchema.optional(),
  settings: updateOrganizationSettingsInputSchema.optional(),
})
export type UpdateOrganizationInput = z.infer<typeof updateOrganizationInputSchema>

export const SLUG_UNAVAILABLE_REASONS = ['invalid', 'taken', 'reserved'] as const
export type SlugUnavailableReason = (typeof SLUG_UNAVAILABLE_REASONS)[number]

/** `GET /api/v1/organizations/slug-availability?slug=`: lenient input, the answer says what is wrong. */
export const slugAvailabilityQuerySchema = z.object({
  slug: z.string().trim().toLowerCase().min(1).max(64),
})
export type SlugAvailabilityQuery = z.infer<typeof slugAvailabilityQuerySchema>

export const slugAvailabilityDtoSchema = z.object({
  slug: z.string(),
  available: z.boolean(),
  reason: z.enum(SLUG_UNAVAILABLE_REASONS).nullable(),
})
export type SlugAvailabilityDto = z.infer<typeof slugAvailabilityDtoSchema>
