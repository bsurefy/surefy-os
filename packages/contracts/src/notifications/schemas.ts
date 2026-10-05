// SPDX-License-Identifier: AGPL-3.0-only
import { z } from 'zod'

import { userRefDtoSchema } from '../auth/schemas.js'
import { pageQuery } from '../core/pagination.js'
import { orgParamsSchema } from '../core/params.js'

// In-app notifications of one member in one organization (database/platform-and-jobs.md §4).
// Routes: GET /api/v1/orgs/:orgId/notifications · GET /api/v1/orgs/:orgId/notifications/unread-count ·
// POST /api/v1/orgs/:orgId/notifications/:notificationId/read ·
// POST /api/v1/orgs/:orgId/notifications/read-all ·
// GET /api/v1/orgs/:orgId/notifications/stream (SSE, `notification` events carrying the DTO).

/** Every notification type; the types arrive with their modules (phase in the database doc). */
export const NOTIFICATION_TYPES = [
  'invitation.reissue_requested',
  'model_access.requested',
  'vault_key.expiring',
  'knowledge_source.ready',
  'knowledge_source.failed',
  'export.ready',
  'export.failed',
  'organization.deletion_scheduled',
  'budget.threshold_reached',
  'approval.requested',
  'approval.decided',
  'chat.shared',
  'connection.expired',
  'flow.paused',
  'piece.blocked',
  'evaluation_run.finished',
  'training_job.finished',
  'access_grant.requested',
] as const
export type NotificationType = (typeof NOTIFICATION_TYPES)[number]

export const NOTIFICATION_TARGET_TYPES = [
  'approval',
  'invitation',
  'vault_model',
  'vault_credential',
  'knowledge_source',
  'export',
  'data_request',
  'organization',
  'budget',
  'chat',
  'connection',
  'flow',
  'piece',
  'evaluation_run',
  'training_job',
  'access_grant',
] as const
export type NotificationTargetType = (typeof NOTIFICATION_TARGET_TYPES)[number]

export const NOTIFICATION_CHANNELS = ['inApp', 'email'] as const
export type NotificationChannel = (typeof NOTIFICATION_CHANNELS)[number]

export interface NotificationDefault {
  inApp: boolean
  email: boolean
  /** Security and money: the email copy is always sent, whatever the member prefers. */
  emailRequired: boolean
}

const optional: NotificationDefault = { inApp: true, email: false, emailRequired: false }
const emailed: NotificationDefault = { inApp: true, email: true, emailRequired: false }
const required: NotificationDefault = { inApp: true, email: true, emailRequired: true }

/** Channel defaults per type; `MemberPreferences.notifications` overrides the optional ones. */
export const NOTIFICATION_DEFAULTS = {
  'invitation.reissue_requested': emailed,
  'model_access.requested': emailed,
  'vault_key.expiring': optional,
  'knowledge_source.ready': optional,
  'knowledge_source.failed': emailed,
  'export.ready': emailed,
  'export.failed': emailed,
  'organization.deletion_scheduled': required,
  'budget.threshold_reached': emailed,
  'approval.requested': required,
  'approval.decided': optional,
  'chat.shared': optional,
  'connection.expired': emailed,
  'flow.paused': emailed,
  'piece.blocked': emailed,
  'evaluation_run.finished': optional,
  'training_job.finished': emailed,
  'access_grant.requested': required,
} as const satisfies Record<NotificationType, NotificationDefault>

/**
 * `NotificationParams` v1: ids and display labels (agent name, amount), never content. Each type's
 * typed shape arrives with its module; the common part is `version`.
 */
export const notificationParamsSchema = z
  .object({ version: z.literal(1) })
  .catchall(z.union([z.string(), z.number(), z.boolean(), z.null()]))
export type NotificationParams = z.infer<typeof notificationParamsSchema>

export const notificationDtoSchema = z.object({
  id: z.uuid(),
  type: z.enum(NOTIFICATION_TYPES),
  params: notificationParamsSchema,
  /** Polymorphic, no foreign key: a deleted target shows "No longer available" when opened. */
  target: z.object({ type: z.enum(NOTIFICATION_TARGET_TYPES), id: z.uuid() }).nullable(),
  /** Who caused it, when a person did. */
  actor: userRefDtoSchema.nullable(),
  readAt: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(),
})
export type NotificationDto = z.infer<typeof notificationDtoSchema>

export const listNotificationsQuerySchema = pageQuery.extend({
  unreadOnly: z.stringbool().optional(),
})
export type ListNotificationsQuery = z.infer<typeof listNotificationsQuerySchema>

export const notificationIdParamsSchema = orgParamsSchema.extend({ notificationId: z.uuid() })
export type NotificationIdParams = z.infer<typeof notificationIdParamsSchema>

/** `GET /api/v1/orgs/:orgId/notifications/unread-count` (the bell badge). */
export const unreadCountDtoSchema = z.object({ count: z.number().int().nonnegative() })
export type UnreadCountDto = z.infer<typeof unreadCountDtoSchema>

/** `POST /api/v1/orgs/:orgId/notifications/read-all`. */
export const markAllReadResultDtoSchema = z.object({ affected: z.number().int().nonnegative() })
export type MarkAllReadResultDto = z.infer<typeof markAllReadResultDtoSchema>
