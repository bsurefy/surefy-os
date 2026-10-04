// SPDX-License-Identifier: AGPL-3.0-only
import { z } from 'zod'

import { userRefDtoSchema } from '../auth/schemas.js'
import { searchQuery } from '../core/filters.js'
import { pageQuery, sortQuery } from '../core/pagination.js'
import { orgParamsSchema } from '../core/params.js'
import { ORG_ROLES } from '../core/roles.js'

// Tables: teams, team_members (database/organizations-and-members.md). Settings › Teams.
// Routes: GET/POST /api/v1/orgs/:orgId/teams · GET/PATCH/DELETE /api/v1/orgs/:orgId/teams/:teamId ·
// GET /api/v1/orgs/:orgId/teams/:teamId/deletion-impact ·
// GET/POST /api/v1/orgs/:orgId/teams/:teamId/members ·
// DELETE /api/v1/orgs/:orgId/teams/:teamId/members/:userId.

/** Unique per organization, case-insensitive. */
export const teamNameSchema = z.string().trim().min(1).max(100)
export const teamDescriptionSchema = z.string().trim().max(500)

/** A team as other DTOs embed it (members, invitations, effective access). */
export const teamRefDtoSchema = z.object({ id: z.uuid(), name: z.string() })
export type TeamRefDto = z.infer<typeof teamRefDtoSchema>

export const teamDtoSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  description: z.string().nullable(),
  leadUserId: z.uuid().nullable(),
  memberCount: z.number().int().nonnegative(),
  /** Members whose usage is charged to this team (`organization_members.primary_team_id`). */
  primaryMemberCount: z.number().int().nonnegative(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
})
export type TeamDto = z.infer<typeof teamDtoSchema>

export const TEAM_SORT_FIELDS = ['name', 'createdAt'] as const

export const listTeamsQuerySchema = pageQuery.extend({
  q: searchQuery,
  sort: sortQuery(TEAM_SORT_FIELDS),
})
export type ListTeamsQuery = z.infer<typeof listTeamsQuerySchema>

export const teamParamsSchema = orgParamsSchema.extend({ teamId: z.uuid() })
export type TeamParams = z.infer<typeof teamParamsSchema>

export const TEAM_MEMBERS_MAX_PER_REQUEST = 100

/** The lead must be one of the team's members; `memberUserIds` are added in the same transaction. */
export const createTeamInputSchema = z.object({
  name: teamNameSchema,
  description: teamDescriptionSchema.optional(),
  leadUserId: z.uuid().optional(),
  memberUserIds: z.array(z.uuid()).max(TEAM_MEMBERS_MAX_PER_REQUEST).default([]),
})
export type CreateTeamInput = z.infer<typeof createTeamInputSchema>

export const updateTeamInputSchema = z.object({
  name: teamNameSchema.optional(),
  description: teamDescriptionSchema.nullable().optional(),
  leadUserId: z.uuid().nullable().optional(),
})
export type UpdateTeamInput = z.infer<typeof updateTeamInputSchema>

/** What a team deletion takes away (from `dependency_edges`); shown in the T2 dialog. */
export const teamDeletionImpactDtoSchema = z.object({
  memberCount: z.number().int().nonnegative(),
  /** Members who lose their primary team and are charged to no team until they get a new one. */
  primaryMemberCount: z.number().int().nonnegative(),
  /** Team-scoped connections that must be moved or removed first. */
  connectionCount: z.number().int().nonnegative(),
  /** Other dependents by type (`agent`, `knowledge_base`, `model`, `flow`…), counted. */
  dependents: z.array(z.object({ type: z.string(), count: z.number().int().nonnegative() })),
})
export type TeamDeletionImpactDto = z.infer<typeof teamDeletionImpactDtoSchema>

/** What happens to the team's connections and what depends on them when the team is deleted. */
export const TEAM_CONNECTIONS_ACTIONS = ['move-to-organization', 'remove'] as const
export type TeamConnectionsAction = (typeof TEAM_CONNECTIONS_ACTIONS)[number]

/** `DELETE /api/v1/orgs/:orgId/teams/:teamId`: required when the team has connections. */
export const deleteTeamQuerySchema = z.object({
  connections: z.enum(TEAM_CONNECTIONS_ACTIONS).optional(),
})
export type DeleteTeamQuery = z.infer<typeof deleteTeamQuerySchema>

/** A member of a team (team detail). */
export const teamMemberDtoSchema = z.object({
  user: userRefDtoSchema,
  role: z.enum(ORG_ROLES),
  isLead: z.boolean(),
  /** This team is the member's primary team ("Primary" badge). */
  isPrimary: z.boolean(),
  addedAt: z.iso.datetime(),
})
export type TeamMemberDto = z.infer<typeof teamMemberDtoSchema>

export const listTeamMembersQuerySchema = pageQuery.extend({ q: searchQuery })
export type ListTeamMembersQuery = z.infer<typeof listTeamMembersQuerySchema>

/** `POST /api/v1/orgs/:orgId/teams/:teamId/members`: members of the organization to add. */
export const addTeamMembersInputSchema = z.object({
  userIds: z.array(z.uuid()).min(1).max(TEAM_MEMBERS_MAX_PER_REQUEST),
})
export type AddTeamMembersInput = z.infer<typeof addTeamMembersInputSchema>

export const addTeamMembersResultDtoSchema = z.object({
  /** Newly added; people already in the team are skipped, not an error. */
  added: z.number().int().nonnegative(),
})
export type AddTeamMembersResultDto = z.infer<typeof addTeamMembersResultDtoSchema>

export const teamMemberParamsSchema = teamParamsSchema.extend({ userId: z.uuid() })
export type TeamMemberParams = z.infer<typeof teamMemberParamsSchema>
