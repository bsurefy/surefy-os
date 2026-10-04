// SPDX-License-Identifier: AGPL-3.0-only
import { z } from 'zod'

import {
  listNotificationsQuerySchema,
  localeSchema,
  markAllReadResultDtoSchema,
  notificationDtoSchema,
  notificationIdParamsSchema,
  okResponse,
  orgParamsSchema,
  pageResponse,
  unreadCountDtoSchema,
} from '@surefy/contracts'

const TAGS = ['notifications']

export const listNotificationsRoute = {
  tags: TAGS,
  summary: "List the current member's notifications, newest first",
  params: orgParamsSchema,
  querystring: listNotificationsQuerySchema,
  response: { 200: pageResponse(notificationDtoSchema) },
}

export const unreadCountRoute = {
  tags: TAGS,
  summary: "Count the current member's unread notifications",
  params: orgParamsSchema,
  response: { 200: okResponse(unreadCountDtoSchema) },
}

export const markNotificationReadRoute = {
  tags: TAGS,
  summary: 'Mark one notification as read',
  params: notificationIdParamsSchema,
  response: { 200: okResponse(notificationDtoSchema) },
}

export const markAllNotificationsReadRoute = {
  tags: TAGS,
  summary: "Mark all of the current member's notifications as read",
  params: orgParamsSchema,
  response: { 200: okResponse(markAllReadResultDtoSchema) },
}

// ---- Internal: the `sendEmail` job payload ---------------------------------------------------

/** Links in emails point at the web apps over http(s) only. */
const emailLink = z.url({ protocol: /^https?$/ })
const label = z.string().trim().min(1).max(200)
const recipient = {
  to: z.email(),
  /** The recipient's locale; the source locale when absent. */
  locale: localeSchema.optional(),
}

/**
 * One email to send, per template. The link carries a token that exists in plain text only at
 * this moment (the database holds its hash), so it travels in the payload; nothing else does
 * beyond the recipient address and display labels.
 */
export const sendEmailPayloadSchema = z.discriminatedUnion('template', [
  z.object({ template: z.literal('verifyEmail'), ...recipient, url: emailLink }),
  z.object({ template: z.literal('passwordReset'), ...recipient, url: emailLink }),
  z.object({
    template: z.literal('invitation'),
    ...recipient,
    orgId: z.uuid(),
    invitationId: z.uuid(),
    url: emailLink,
    organizationName: label,
    /** null when the inviter's account no longer exists. */
    inviterName: label.nullable(),
  }),
])
export type SendEmailPayload = z.infer<typeof sendEmailPayloadSchema>
export type EmailTemplate = SendEmailPayload['template']
