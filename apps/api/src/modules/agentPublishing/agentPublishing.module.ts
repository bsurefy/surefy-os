// SPDX-License-Identifier: AGPL-3.0-only
import { ApiChannel } from './agentPublishing.api.js'
import { createAgentChannels } from './agentPublishing.channels.js'
import { AgentPublishingController } from './agentPublishing.controller.js'
import { Idempotency } from './agentPublishing.idempotency.js'
import { AgentChannelsRepository } from './agentPublishing.repository.js'
import { agentPublishingRoutes } from './agentPublishing.routes.js'

import type { Cache } from '@/core/cache/index.js'
import type { Database } from '@/core/database/index.js'
import type { AgentRunsAgents, AgentRunsModule, AgentRunsUsers } from '@/modules/agentRuns/index.js'

/**
 * The channel rows and the agents module's port over them. Built before the agents module, which
 * takes the port; the module below needs the agents and runs that are built after it.
 */
export function createChannelStore(users: AgentRunsUsers) {
  const repository = new AgentChannelsRepository()
  return { repository, channels: createAgentChannels({ repository, users }) }
}
export type ChannelStore = ReturnType<typeof createChannelStore>

export interface AgentPublishingModuleDeps {
  db: Database
  cache: Pick<Cache, 'client'>
  store: ChannelStore
  agents: Pick<AgentRunsAgents, 'findById'>
  runs: Pick<AgentRunsModule, 'service' | 'queries' | 'streamer'>
}

/**
 * Where a published agent answers: the channels table, the SurefyOS chat and API channels, and the
 * public run route (database/agents-and-runs.md, §4; backend/agent-runs.md, §3). Channel adapters
 * start runs and deliver answers; they never execute anything.
 */
export function createAgentPublishingModule(deps: AgentPublishingModuleDeps) {
  const { repository, channels } = deps.store
  const api = new ApiChannel({
    db: deps.db,
    cache: deps.cache,
    repository,
    agents: deps.agents,
    runs: deps.runs.service,
    queries: deps.runs.queries,
    idempotency: new Idempotency(deps.cache),
  })
  const controller = new AgentPublishingController(api, deps.runs.streamer)
  return {
    /** The agents module's port: list, publish and disconnect an agent's channels. */
    channels,
    api,
    repository,
    routes: agentPublishingRoutes(controller),
  }
}
export type AgentPublishingModule = ReturnType<typeof createAgentPublishingModule>
