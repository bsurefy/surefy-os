// SPDX-License-Identifier: AGPL-3.0-only
import { z } from 'zod'

import { NOTIFICATION_TYPES } from '../notifications/schemas.js'

// Table: member_preferences (database/organizations-and-members.md §8). Profile, per organization.
// Routes: GET/PATCH /api/v1/orgs/:orgId/members/me/preferences (`members:manage-self`).

export const TABLE_DENSITIES = ['comfortable', 'compact'] as const
export type TableDensity = (typeof TABLE_DENSITIES)[number]

export const notificationChannelsSchema = z.object({
  inApp: z.boolean(),
  email: z.boolean(),
})
export type NotificationChannels = z.infer<typeof notificationChannelsSchema>

const notificationTypeSchema = z.enum(NOTIFICATION_TYPES)

/**
 * `MemberPreferences` v1: the `member_preferences.preferences` JSONB. Absent notification types use
 * `NOTIFICATION_DEFAULTS`; types whose email is required ignore the stored `email` flag.
 */
export const memberPreferencesSchema = z.object({
  version: z.literal(1),
  notifications: z.partialRecord(notificationTypeSchema, notificationChannelsSchema).default({}),
  checklistDismissed: z.boolean().default(false),
  tableDensity: z.enum(TABLE_DENSITIES).default('comfortable'),
})
export type MemberPreferences = z.infer<typeof memberPreferencesSchema>

/** Resolved preferences: every notification type present, defaults applied. */
export const memberPreferencesDtoSchema = z.object({
  /** Default chat model; null until chosen, ignored when the model is no longer allowed. */
  defaultModelKey: z.string().nullable(),
  notifications: z.record(notificationTypeSchema, notificationChannelsSchema),
  checklistDismissed: z.boolean(),
  tableDensity: z.enum(TABLE_DENSITIES),
})
export type MemberPreferencesDto = z.infer<typeof memberPreferencesDtoSchema>

export const updateMemberPreferencesInputSchema = z.object({
  defaultModelKey: z.string().trim().min(1).max(200).nullable().optional(),
  notifications: z
    .partialRecord(notificationTypeSchema, notificationChannelsSchema.partial())
    .optional(),
  checklistDismissed: z.boolean().optional(),
  tableDensity: z.enum(TABLE_DENSITIES).optional(),
})
export type UpdateMemberPreferencesInput = z.infer<typeof updateMemberPreferencesInputSchema>
