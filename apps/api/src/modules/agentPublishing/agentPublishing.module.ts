// SPDX-License-Identifier: AGPL-3.0-only
import { ApiChannel } from './agentPublishing.api.js'
import { createAgentChannels } from './agentPublishing.channels.js'
import {
  AgentChannelsController,
  AgentPublishingController,
  WidgetController,
} from './agentPublishing.controller.js'
import { Idempotency } from './agentPublishing.idempotency.js'
import { RateWindows } from './agentPublishing.limits.js'
import { ChannelManager } from './agentPublishing.manage.js'
import { AgentChannelsRepository } from './agentPublishing.repository.js'
import { agentPublishingRoutes, widgetScriptRoutes } from './agentPublishing.routes.js'
import { widgetScriptLoader } from './agentPublishing.script.js'
import { WidgetChannel } from './agentPublishing.widget.js'

import type { WidgetScript } from './agentPublishing.script.js'
import type { WidgetChannelDeps } from './agentPublishing.widget.js'
import type { Cache } from '@/core/cache/index.js'
import type { Database } from '@/core/database/index.js'
import type { Logger } from '@/core/logger/index.js'
import type { AgentRunsAgents, AgentRunsModule, AgentRunsUsers } from '@/modules/agentRuns/index.js'
import type { AuditRecorder } from '@/modules/audit/index.js'

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
  logger: Logger
  store: ChannelStore
  users: AgentRunsUsers
  agents: Pick<AgentRunsAgents, 'findById' | 'findUsable' | 'findVersion'>
  runs: Pick<AgentRunsModule, 'service' | 'queries' | 'streamer'>
  organizations: WidgetChannelDeps['organizations']
  access: WidgetChannelDeps['access']
  audit: AuditRecorder
  /** The widget script; tests pass their own. */
  widgetScript?: () => Promise<WidgetScript | null>
}

/**
 * Where a published agent answers: the channels table and its routes, the SurefyOS chat, API and
 * website widget channels, the public run route and the public widget endpoint
 * (database/agents-and-runs.md, §4; backend/agent-runs.md, §3). Channel adapters start runs and
 * deliver answers; they never execute anything.
 */
export function createAgentPublishingModule(deps: AgentPublishingModuleDeps) {
  const { repository, channels } = deps.store
  const limits = new RateWindows(deps.cache)
  const api = new ApiChannel({
    db: deps.db,
    repository,
    agents: deps.agents,
    runs: deps.runs.service,
    queries: deps.runs.queries,
    idempotency: new Idempotency(deps.cache),
    limits,
  })
  const manager = new ChannelManager({
    db: deps.db,
    repository,
    users: deps.users,
    agents: deps.agents,
    audit: deps.audit,
  })
  const widget = new WidgetChannel({
    db: deps.db,
    cache: deps.cache,
    logger: deps.logger,
    repository,
    agents: deps.agents,
    organizations: deps.organizations,
    access: deps.access,
    runs: deps.runs.service,
    queries: deps.runs.queries,
    streamer: deps.runs.streamer,
    limits,
  })
  const widgetController = new WidgetController(widget, deps.widgetScript ?? widgetScriptLoader())
  return {
    /** The agents module's port: list, publish and disconnect an agent's channels. */
    channels,
    api,
    manager,
    widget,
    repository,
    routes: agentPublishingRoutes({
      api: new AgentPublishingController(api, deps.runs.streamer),
      channels: new AgentChannelsController(manager),
      widget: widgetController,
    }),
    /** `/widget/v1/widget.js`, registered outside `/api/v1`. */
    scriptRoutes: widgetScriptRoutes(widgetController),
  }
}
export type AgentPublishingModule = ReturnType<typeof createAgentPublishingModule>
