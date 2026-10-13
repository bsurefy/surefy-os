// SPDX-License-Identifier: AGPL-3.0-only
import { viewerOf, type AgentsRepository } from '@/modules/agents/index.js'

import type { AgentRunsAgents, AgentRunsPeople, RunnableAgent } from './agentRuns.types.js'
import type { AccessService } from '@/modules/access/index.js'

/** The agents module's rows, as a run reads them: an agent, the definition of one of its versions. */
export function createAgentRunsAgents(repository: AgentsRepository): AgentRunsAgents {
  const runnable = (
    row: NonNullable<Awaited<ReturnType<AgentsRepository['findById']>>>,
    canEdit: boolean,
  ): RunnableAgent => ({
    id: row.id,
    name: row.name,
    status: row.status,
    ownerUserId: row.ownerUserId,
    liveVersionId: row.liveVersionId,
    draftDefinition: row.draftDefinition,
    deletedAt: row.deletedAt,
    canEdit,
  })
  return {
    async findUsable(tx, ctx, agentId) {
      const found = await repository.findVisible(tx, ctx.orgId, agentId, viewerOf(ctx))
      return found === undefined ? undefined : runnable(found.agent, found.canEdit)
    },
    async findById(tx, orgId, agentId) {
      const row = await repository.findById(tx, orgId, agentId)
      return row === undefined ? undefined : runnable(row, false)
    },
    async findVersion(tx, orgId, agentId, versionId) {
      const row = await repository.findVersion(tx, orgId, agentId, versionId)
      return row === undefined
        ? undefined
        : { id: row.id, version: row.version, definition: row.definition }
    },
  }
}

/** A member's role, teams and primary team (access module); null when they are not an active member. */
export function createAgentRunsPeople(access: Pick<AccessService, 'forMember'>): AgentRunsPeople {
  return {
    async forMember(orgId, userId) {
      const effective = await access.forMember(orgId, userId)
      return effective?.role == null
        ? null
        : {
            role: effective.role,
            teamIds: effective.teamIds,
            primaryTeamId: effective.primaryTeamId,
          }
    },
  }
}
