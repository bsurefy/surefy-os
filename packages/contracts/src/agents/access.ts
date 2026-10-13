// SPDX-License-Identifier: AGPL-3.0-only
import { z } from 'zod'

import { userRefDtoSchema } from '../auth/schemas.js'
import { orgParamsSchema } from '../core/params.js'
import { teamRefDtoSchema } from '../teams/schemas.js'

// Who may use or edit an agent: "Who can use it" on the Publish tab (database/agents-and-runs.md
// §3). Routes, under /api/v1/orgs/:orgId/agents/:agentId: GET/PUT /access.
// Audience rows are live metadata, not versioned: a rollback does not change them. Every write
// bumps the organization's access version. Adding an audience re-runs "model allowed for every
// audience" (AGENT_MODEL_NOT_ALLOWED_FOR_AUDIENCE).

export const agentParamsSchema = orgParamsSchema.extend({ agentId: z.uuid() })
export type AgentParams = z.infer<typeof agentParamsSchema>

export const AGENT_ACCESS_SUBJECT_TYPES = ['organization', 'team', 'user'] as const
export type AgentAccessSubjectType = (typeof AGENT_ACCESS_SUBJECT_TYPES)[number]

/** `edit` lets a Builder edit, test and publish the agent, and implies `use`. */
export const AGENT_ACCESS_LEVELS = ['use', 'edit'] as const
export type AgentAccessLevel = (typeof AGENT_ACCESS_LEVELS)[number]

export const AGENT_ACCESS_ENTRIES_MAX = 200

export const agentAccessEntryDtoSchema = z.object({
  id: z.uuid(),
  subjectType: z.enum(AGENT_ACCESS_SUBJECT_TYPES),
  team: teamRefDtoSchema.nullable(),
  user: userRefDtoSchema.nullable(),
  level: z.enum(AGENT_ACCESS_LEVELS),
  createdAt: z.iso.datetime(),
})
export type AgentAccessEntryDto = z.infer<typeof agentAccessEntryDtoSchema>

export const agentAccessDtoSchema = z.object({ entries: z.array(agentAccessEntryDtoSchema) })
export type AgentAccessDto = z.infer<typeof agentAccessDtoSchema>

/** "Everyone" can only use an agent; a team or a person can use or edit it. */
const agentAccessEntryInputSchema = z.discriminatedUnion('subjectType', [
  z.object({ subjectType: z.literal('organization'), level: z.literal('use') }),
  z.object({
    subjectType: z.literal('team'),
    teamId: z.uuid(),
    level: z.enum(AGENT_ACCESS_LEVELS),
  }),
  z.object({
    subjectType: z.literal('user'),
    userId: z.uuid(),
    level: z.enum(AGENT_ACCESS_LEVELS),
  }),
])
export type AgentAccessEntryInput = z.infer<typeof agentAccessEntryInputSchema>

function subjectKey(entry: AgentAccessEntryInput): string {
  if (entry.subjectType === 'organization') return 'organization'
  if (entry.subjectType === 'team') return `team:${entry.teamId}`
  return `user:${entry.userId}`
}

/** The whole audience, one row per subject. The owner and Admins keep access without a row. */
export const agentAccessInputSchema = z
  .array(agentAccessEntryInputSchema)
  .max(AGENT_ACCESS_ENTRIES_MAX)
  .refine((entries) => new Set(entries.map(subjectKey)).size === entries.length)
export type AgentAccessInput = z.infer<typeof agentAccessInputSchema>

/** `PUT …/access`. */
export const replaceAgentAccessInputSchema = z.object({ entries: agentAccessInputSchema })
export type ReplaceAgentAccessInput = z.infer<typeof replaceAgentAccessInputSchema>

/** "Shared with" on the card: everyone, or a few teams and a count of the rest. */
export const agentAudienceSummaryDtoSchema = z.object({
  everyone: z.boolean(),
  teams: z.array(teamRefDtoSchema).max(3),
  teamCount: z.number().int().nonnegative(),
  userCount: z.number().int().nonnegative(),
})
export type AgentAudienceSummaryDto = z.infer<typeof agentAudienceSummaryDtoSchema>
