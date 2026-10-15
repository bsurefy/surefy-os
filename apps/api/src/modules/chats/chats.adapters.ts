// SPDX-License-Identifier: AGPL-3.0-only
import type { OrganizationDto } from '@surefy/contracts'

import type { ChatAgent, ChatAgentRuns, ChatOrganizations, ChatWebSearch } from './chats.types.js'
import type { DbExecutor } from '@/core/database/index.js'
import type { WebSearchService } from '@/integrations/search/index.js'
import type { AgentRunsAgents, AgentRunsModule } from '@/modules/agentRuns/index.js'

/** Agent chats over the agents and agentRuns modules: the usable agent, `chat` runs, their stream. */
export function createChatAgentRuns(deps: {
  agents: AgentRunsAgents
  runs: Pick<AgentRunsModule, 'service' | 'queries' | 'streamer'>
}): ChatAgentRuns {
  const findUsable: ChatAgentRuns['findUsable'] = async (tx, ctx, agentId) => {
    const agent = await deps.agents.findUsable(tx, ctx, agentId)
    if (agent?.deletedAt !== null || agent.liveVersionId === null) return
    const version = await deps.agents.findVersion(tx, ctx.orgId, agent.id, agent.liveVersionId)
    if (version === undefined) return
    const usable: ChatAgent = {
      id: agent.id,
      name: agent.name,
      status: agent.status,
      modelKey: version.definition.model.modelKey,
    }
    return usable
  }
  return {
    findUsable,
    async start(ctx, input) {
      const run = await deps.runs.service.start(ctx, {
        agentId: input.agentId,
        trigger: 'chat',
        chatId: input.chatId,
        input: { messages: input.messages },
      })
      return { id: run.id }
    },
    async stream(ctx, runId) {
      const run = await deps.runs.queries.access(ctx, runId)
      return deps.runs.streamer.response(ctx, run)
    },
    async refs(tx, ctx, agentIds) {
      const refs = new Map<string, { id: string; name: string; isAvailable: boolean }>()
      for (const agentId of new Set(agentIds)) {
        // the name stays readable when the agent is no longer shared with the person
        const agent = await deps.agents.findById(tx, ctx.orgId, agentId)
        if (agent === undefined) continue
        const usable = agent.deletedAt === null ? await findUsable(tx, ctx, agentId) : undefined
        refs.set(agentId, {
          id: agentId,
          name: agent.name,
          isAvailable: usable?.status === 'active',
        })
      }
      return refs
    },
  }
}

/** The organization's chat sharing setting (organizations module). */
export function createChatOrganizations(organizations: {
  getInTx(tx: DbExecutor, orgId: string): Promise<OrganizationDto | undefined>
}): ChatOrganizations {
  return {
    async sharingEnabledInTx(tx, orgId) {
      const organization = await organizations.getInTx(tx, orgId)
      return organization?.settings.privacy.chatSharingEnabled ?? false
    },
  }
}

/** Chat answers with web search over the search integration; the person's team is who it is metered for. */
export function createChatWebSearch(
  search: Pick<WebSearchService, 'isConfigured' | 'search'>,
): ChatWebSearch {
  return {
    isConfigured: (orgId) => search.isConfigured(orgId),
    search: ({ ctx, query, messageId, signal }) =>
      search.search({
        orgId: ctx.orgId,
        query,
        teamIds: ctx.teamIds,
        requestId: ctx.requestId,
        caller: {
          userId: ctx.userId,
          teamId: ctx.access.primaryTeamId,
          apiKeyId: ctx.apiKey?.id ?? null,
        },
        meter: { key: `chat:${messageId}`, sourceRefId: messageId },
        ...(signal === undefined ? {} : { signal }),
      }),
  }
}
