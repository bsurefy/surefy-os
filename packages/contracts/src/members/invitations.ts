// SPDX-License-Identifier: AGPL-3.0-only
import { z } from 'zod'

import { emailSchema } from '../auth/schemas.js'
import { multiValueQuery, searchQuery } from '../core/filters.js'
import { pageQuery } from '../core/pagination.js'
import { orgParamsSchema } from '../core/params.js'
import { ORG_ROLES } from '../core/roles.js'
import { organizationRefDtoSchema } from '../organizations/schemas.js'
import { teamRefDtoSchema } from '../teams/schemas.js'

// Tables: invitations, invitation_teams (database/organizations-and-members.md §4–5).
// Organization routes (`members:invite`): GET/POST /api/v1/orgs/:orgId/invitations ·
// POST /api/v1/orgs/:orgId/invitations/:invitationId/{resend,link,revoke}.
// Link routes, by the token from the email: GET /api/v1/invitations/:token (public) ·
// POST /api/v1/invitations/:token/accept (signed in, verified email must match) ·
// POST /api/v1/invitations/:token/request-reissue (public, 204; notifies the inviter).

export const INVITATION_STATUSES = ['pending', 'accepted', 'revoked', 'expired'] as const
export type InvitationStatus = (typeof INVITATION_STATUSES)[number]

export const INVITATION_DELIVERY_STATUSES = ['queued', 'sent', 'failed', 'bounced'] as const
export type InvitationDeliveryStatus = (typeof INVITATION_DELIVERY_STATUSES)[number]

/** The raw link token: 43 base62 characters (256 bits); only its sha256 is stored. */
export const INVITATION_TOKEN_PATTERN = /^[A-Za-z0-9]{43}$/
export const invitationTokenParamsSchema = z.object({
  token: z.string().regex(INVITATION_TOKEN_PATTERN),
})
export type InvitationTokenParams = z.infer<typeof invitationTokenParamsSchema>

/** Most teams one invitation may add the person to; the first listed becomes the primary team. */
export const INVITATION_TEAMS_MAX = 20

/**
 * `status` is computed: a `pending` row past `expiresAt` is reported `expired`. "Not delivered ·
 * Copy invite link" shows for `deliveryStatus` `failed` or `bounced`.
 */
export const invitationDtoSchema = z.object({
  id: z.uuid(),
  email: z.string(),
  role: z.enum(ORG_ROLES),
  status: z.enum(INVITATION_STATUSES),
  deliveryStatus: z.enum(INVITATION_DELIVERY_STATUSES),
  teams: z.array(teamRefDtoSchema),
  invitedBy: z.object({ userId: z.uuid(), name: z.string() }).nullable(),
  expiresAt: z.iso.datetime(),
  lastSentAt: z.iso.datetime().nullable(),
  sendCount: z.number().int().nonnegative(),
  acceptedAt: z.iso.datetime().nullable(),
  revokedAt: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
})
export type InvitationDto = z.infer<typeof invitationDtoSchema>

/**
 * `POST /api/v1/orgs/:orgId/invitations` (201; accepts `Idempotency-Key`). One address per request:
 * the dialog's list of emails becomes one request each, so every failure keeps its own code. Only
 * Owners invite Owners; a seat limit fails with `LIMIT_REACHED` (`limit: 'seats'`).
 */
export const createInvitationInputSchema = z.object({
  email: emailSchema,
  role: z.enum(ORG_ROLES),
  teamIds: z.array(z.uuid()).max(INVITATION_TEAMS_MAX).default([]),
})
export type CreateInvitationInput = z.infer<typeof createInvitationInputSchema>

/** Defaults to pending invitations, which the Members table shows next to memberships. */
export const listInvitationsQuerySchema = pageQuery.extend({
  q: searchQuery,
  status: multiValueQuery(z.enum(INVITATION_STATUSES)),
})
export type ListInvitationsQuery = z.infer<typeof listInvitationsQuerySchema>

export const invitationParamsSchema = orgParamsSchema.extend({ invitationId: z.uuid() })
export type InvitationParams = z.infer<typeof invitationParamsSchema>

/** `POST …/invitations/:invitationId/link`: a fresh link, shown once; the previous one stops working. */
export const invitationLinkDtoSchema = z.object({
  url: z.url(),
  expiresAt: z.iso.datetime(),
})
export type InvitationLinkDto = z.infer<typeof invitationLinkDtoSchema>

/** `GET /api/v1/invitations/:token`: what the accept screen shows before the person signs in or up. */
export const invitationPreviewDtoSchema = z.object({
  organization: organizationRefDtoSchema.pick({ name: true, slug: true, logoUrl: true }),
  role: z.enum(ORG_ROLES),
  email: z.string(),
  inviterName: z.string().nullable(),
  status: z.enum(INVITATION_STATUSES),
  expiresAt: z.iso.datetime(),
  /** The organization requires two-factor: set it up before landing in it. */
  requiresTwoFactor: z.boolean(),
})
export type InvitationPreviewDto = z.infer<typeof invitationPreviewDtoSchema>

/** `POST /api/v1/invitations/:token/accept`: the membership created, with where to go next. */
export const acceptInvitationResultDtoSchema = z.object({
  organization: organizationRefDtoSchema,
  memberId: z.uuid(),
})
export type AcceptInvitationResultDto = z.infer<typeof acceptInvitationResultDtoSchema>
