// SPDX-License-Identifier: AGPL-3.0-only
import { z } from 'zod'

import { emailSchema, passwordSchema, personNameSchema, userDtoSchema } from '../auth/schemas.js'
import { localeSchema } from '../core/locales.js'
import {
  organizationNameSchema,
  organizationRefDtoSchema,
  organizationSlugSchema,
  SETUP_STEPS,
  timezoneSchema,
} from '../organizations/schemas.js'

// First-run setup of a self-hosted install (backend/authentication.md §5, design F1).
// Routes: GET /api/v1/setup/status (public) · POST /api/v1/setup (public, SETUP_TOKEN when set) ·
// POST /api/v1/orgs/:orgId/setup/complete · GET /api/v1/orgs/:orgId/setup/checklist.

/** The Welcome step's server check. */
export const SETUP_CHECK_KEYS = ['server', 'database', 'storage', 'email', 'gpu'] as const
export type SetupCheckKey = (typeof SETUP_CHECK_KEYS)[number]
export const SETUP_CHECK_STATUSES = ['ok', 'warning', 'failed'] as const
export type SetupCheckStatus = (typeof SETUP_CHECK_STATUSES)[number]

/** One check; `blocking` failures (database) stop setup, warnings (no GPU, no email) continue. */
export const setupCheckDtoSchema = z.object({
  key: z.enum(SETUP_CHECK_KEYS),
  status: z.enum(SETUP_CHECK_STATUSES),
  blocking: z.boolean(),
  /** Stable code the UI translates into the fix to apply; null when ok. */
  code: z.string().nullable(),
  /** Developer-facing detail (connection error text); never shown as the main message. */
  detail: z.string().nullable(),
})
export type SetupCheckDto = z.infer<typeof setupCheckDtoSchema>

/**
 * `GET /api/v1/setup/status`. `isComplete` is true once an organization exists (POST /setup is then
 * refused); `finishedAt` is set when the Owner finished or left the remaining steps.
 */
export const setupStatusDtoSchema = z.object({
  isComplete: z.boolean(),
  finishedAt: z.iso.datetime().nullable(),
  /** `SETUP_TOKEN` is set: the request must carry it. */
  requiresToken: z.boolean(),
  checks: z.array(setupCheckDtoSchema),
})
export type SetupStatusDto = z.infer<typeof setupStatusDtoSchema>

/**
 * `POST /api/v1/setup`: creates the first user (Owner), the organization, the Owner membership and
 * the first install administrator in one transaction, then signs the person in.
 */
export const setupInputSchema = z.object({
  token: z.string().min(16).max(256).optional(),
  organization: z.object({
    name: organizationNameSchema,
    slug: organizationSlugSchema,
    timezone: timezoneSchema.optional(),
  }),
  owner: z.object({
    name: personNameSchema,
    email: emailSchema,
    password: passwordSchema,
  }),
  /** Becomes the organization's default locale and the Owner's preference. */
  locale: localeSchema.optional(),
})
export type SetupInput = z.infer<typeof setupInputSchema>

export const setupResultDtoSchema = z.object({
  organization: organizationRefDtoSchema,
  user: userDtoSchema,
})
export type SetupResultDto = z.infer<typeof setupResultDtoSchema>

/** `POST /api/v1/orgs/:orgId/setup/complete`: records skipped steps and `install_settings.setup_completed_at`. */
export const completeSetupInputSchema = z.object({
  skippedSteps: z.array(z.enum(SETUP_STEPS)).max(SETUP_STEPS.length).default([]),
})
export type CompleteSetupInput = z.infer<typeof completeSetupInputSchema>

/** Home-screen checklist items; items of modules not yet available are left out. */
export const SETUP_CHECKLIST_ITEMS = [
  'connect-model',
  'add-documents',
  'invite-team',
  'create-agent',
  'set-budget',
] as const
export type SetupChecklistItem = (typeof SETUP_CHECKLIST_ITEMS)[number]

/** `GET /api/v1/orgs/:orgId/setup/checklist`. */
export const setupChecklistDtoSchema = z.object({
  items: z.array(
    z.object({
      key: z.enum(SETUP_CHECKLIST_ITEMS),
      done: z.boolean(),
    }),
  ),
  /** The member dismissed the checklist (`MemberPreferences.checklistDismissed`). */
  dismissed: z.boolean(),
})
export type SetupChecklistDto = z.infer<typeof setupChecklistDtoSchema>
