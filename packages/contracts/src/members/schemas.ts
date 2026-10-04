// SPDX-License-Identifier: AGPL-3.0-only
import { z } from 'zod'

import { userRefDtoSchema } from '../auth/schemas.js'
import { multiValueQuery, searchQuery } from '../core/filters.js'
import { pageQuery, sortQuery } from '../core/pagination.js'
import { orgParamsSchema } from '../core/params.js'
import { ORG_ROLES } from '../core/roles.js'
import { teamRefDtoSchema } from '../teams/schemas.js'

// Table: organization_members (database/organizations-and-members.md §3). Settings › Members.
// Routes: GET /api/v1/orgs/:orgId/members · GET/PATCH/DELETE /api/v1/orgs/:orgId/members/:memberId ·
// POST /api/v1/orgs/:orgId/members/:memberId/{deactivate,reactivate} ·
// POST /api/v1/orgs/:orgId/members/bulk.

export const MEMBER_STATUSES = ['active', 'deactivated'] as const
export type MemberStatus = (typeof MEMBER_STATUSES)[number]

/** How the membership was created. `scim` and `sso` come from the Enterprise edition, `partner` and `console` from Cloud. */
export const PROVISIONING_SOURCES = [
  'setup',
  'invitation',
  'scim',
  'sso',
  'partner',
  'console',
] as const
export type ProvisioningSource = (typeof PROVISIONING_SOURCES)[number]

export const SIGN_IN_METHOD_TYPES = ['password', 'oauth', 'sso'] as const
export type SignInMethodType = (typeof SIGN_IN_METHOD_TYPES)[number]

/** Derived from the person's accounts, never stored; `providerId` names the OAuth or SSO provider. */
export const signInMethodDtoSchema = z.object({
  type: z.enum(SIGN_IN_METHOD_TYPES),
  providerId: z.string().nullable(),
})
export type SignInMethodDto = z.infer<typeof signInMethodDtoSchema>

export const memberDtoSchema = z.object({
  id: z.uuid(),
  user: userRefDtoSchema,
  role: z.enum(ORG_ROLES),
  status: z.enum(MEMBER_STATUSES),
  primaryTeamId: z.uuid().nullable(),
  teams: z.array(teamRefDtoSchema),
  signInMethod: signInMethodDtoSchema,
  twoFactorEnabled: z.boolean(),
  provisioningSource: z.enum(PROVISIONING_SOURCES),
  /** Written at most once an hour per member. */
  lastActiveAt: z.iso.datetime().nullable(),
  joinedAt: z.iso.datetime(),
  invitedByUserId: z.uuid().nullable(),
  deactivatedAt: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
})
export type MemberDto = z.infer<typeof memberDtoSchema>

export const MEMBER_SORT_FIELDS = ['createdAt', 'name', 'lastActiveAt'] as const

/** The Members table lists pending invitations next to memberships (see `listInvitationsQuerySchema`). */
export const listMembersQuerySchema = pageQuery.extend({
  q: searchQuery,
  role: multiValueQuery(z.enum(ORG_ROLES)),
  status: multiValueQuery(z.enum(MEMBER_STATUSES)),
  teamId: z.uuid().optional(),
  sort: sortQuery(MEMBER_SORT_FIELDS),
})
export type ListMembersQuery = z.infer<typeof listMembersQuerySchema>

export const memberParamsSchema = orgParamsSchema.extend({ memberId: z.uuid() })
export type MemberParams = z.infer<typeof memberParamsSchema>

/**
 * `PATCH …/members/:memberId`. Promotion to Admin or Owner and any demotion are T2; only Owners
 * change Owners (`members:manage-admins`); the primary team must be one of the member's teams.
 */
export const updateMemberInputSchema = z.object({
  role: z.enum(ORG_ROLES).optional(),
  primaryTeamId: z.uuid().nullable().optional(),
})
export type UpdateMemberInput = z.infer<typeof updateMemberInputSchema>

/**
 * `DELETE …/members/:memberId` (T2): the member's agents and flows move to `transferToUserId`,
 * required when they own any; their personal keys and connections are revoked.
 */
export const removeMemberQuerySchema = z.object({ transferToUserId: z.uuid().optional() })
export type RemoveMemberQuery = z.infer<typeof removeMemberQuerySchema>

export const MEMBER_BULK_ACTIONS = ['change-role', 'add-to-team', 'deactivate'] as const
export type MemberBulkAction = (typeof MEMBER_BULK_ACTIONS)[number]
export const MEMBERS_MAX_PER_BULK_ACTION = 100

const memberIdsSchema = z.array(z.uuid()).min(1).max(MEMBERS_MAX_PER_BULK_ACTION)

/** `POST …/members/bulk`: one action on several members; rows that cannot be changed are skipped with a code. */
export const bulkMemberActionInputSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('change-role'),
    memberIds: memberIdsSchema,
    role: z.enum(ORG_ROLES),
  }),
  z.object({ action: z.literal('add-to-team'), memberIds: memberIdsSchema, teamId: z.uuid() }),
  z.object({ action: z.literal('deactivate'), memberIds: memberIdsSchema }),
])
export type BulkMemberActionInput = z.infer<typeof bulkMemberActionInputSchema>

export const bulkMemberActionResultDtoSchema = z.object({
  affected: z.number().int().nonnegative(),
  /** Members left unchanged and the error code that applies to each. */
  skipped: z.array(z.object({ memberId: z.uuid(), code: z.string() })),
})
export type BulkMemberActionResultDto = z.infer<typeof bulkMemberActionResultDtoSchema>
