// SPDX-License-Identifier: AGPL-3.0-only
import { ApiChannel } from './agentPublishing.api.js'
import {
  ChannelPresenter,
  ChannelRequests,
  createAgentChannels,
} from './agentPublishing.channels.js'
import {
  AgentChannelsController,
  AgentPublishingController,
  ChannelWebhooksController,
  WidgetController,
} from './agentPublishing.controller.js'
import { ChannelHistory } from './agentPublishing.history.js'
import { Idempotency } from './agentPublishing.idempotency.js'
import { InboundChannels } from './agentPublishing.inbound.js'
import { ChannelIntake } from './agentPublishing.intake.js'
import { RateWindows } from './agentPublishing.limits.js'
import { ChannelManager } from './agentPublishing.manage.js'
import { ChannelReplies } from './agentPublishing.replies.js'
import { AgentChannelsRepository } from './agentPublishing.repository.js'
import { agentPublishingRoutes, widgetScriptRoutes } from './agentPublishing.routes.js'
import { widgetScriptLoader } from './agentPublishing.script.js'
import { WidgetChannel } from './agentPublishing.widget.js'

import type { AgentChannelsDeps } from './agentPublishing.channels.js'
import type { InboundChannelsDeps } from './agentPublishing.inbound.js'
import type { WidgetScript } from './agentPublishing.script.js'
import type { WidgetChannelDeps } from './agentPublishing.widget.js'
import type { Cache } from '@/core/cache/index.js'
import type { Database } from '@/core/database/index.js'
import type { Logger } from '@/core/logger/index.js'
import type { AgentRunsAgents, AgentRunsModule, AgentRunsUsers } from '@/modules/agentRuns/index.js'
import type { AuditRecorder } from '@/modules/audit/index.js'
import type { OutboundHttp } from '@/modules/connections/index.js'

export interface ChannelStoreDeps {
  db: Database
  users: AgentRunsUsers
  connections: AgentChannelsDeps['connections']
  approvals: AgentChannelsDeps['approvals']
  /** The public API address (webhook addresses) and the key of the WhatsApp verify tokens. */
  webhooks: AgentChannelsDeps['webhooks']
}

/**
 * The channel rows, the requests that turn them on and the agents module's port over them. Built
 * before the agents module, which takes the port; the module below needs the agents and runs
 * that are built after it.
 */
export function createChannelStore(deps: ChannelStoreDeps) {
  const repository = new AgentChannelsRepository()
  const presenter = new ChannelPresenter(deps)
  const requests = new ChannelRequests({ ...deps, repository })
  return {
    repository,
    presenter,
    /** The approvals module's hook for `channel_publish`. */
    requests,
    channels: createAgentChannels({ repository, presenter, requests }),
  }
}
export type ChannelStore = ReturnType<typeof createChannelStore>

export interface AgentPublishingModuleDeps {
  db: Database
  cache: Pick<Cache, 'client'>
  logger: Logger
  store: ChannelStore
  users: AgentRunsUsers
  agents: Pick<AgentRunsAgents, 'findById' | 'findUsable' | 'findVersion'>
  runs: Pick<AgentRunsModule, 'service' | 'queries' | 'streamer' | 'repository'>
  organizations: WidgetChannelDeps['organizations']
  access: WidgetChannelDeps['access']
  audit: AuditRecorder
  connections: InboundChannelsDeps['connections']
  http: OutboundHttp
  /** The Slack app's signing secret and the key of the WhatsApp verify tokens. */
  inbound: Pick<InboundChannelsDeps, 'slackSigningSecret' | 'verifyKey'>
  /** Stub servers that stand in for Slack and WhatsApp (`CONNECTIONS_PROVIDER_ORIGINS`). */
  origins?: { slack?: string; whatsapp?: string }
  /** The widget script; tests pass their own. */
  widgetScript?: () => Promise<WidgetScript | null>
}

/**
 * Where a published agent answers: the channels table and its routes, the SurefyOS chat, API,
 * website widget, Slack and WhatsApp channels, the public run route, the public widget endpoint
 * and the Slack and WhatsApp webhooks
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
    presenter: deps.store.presenter,
    requests: deps.store.requests,
    agents: deps.agents,
    audit: deps.audit,
  })
  const history = new ChannelHistory({ cache: deps.cache, logger: deps.logger })
  const intake = new ChannelIntake({
    db: deps.db,
    cache: deps.cache,
    logger: deps.logger,
    repository,
    access: deps.access,
    runs: deps.runs.service,
    limits,
    history,
  })
  const inbound = new InboundChannels({
    intake,
    connections: deps.connections,
    http: deps.http,
    logger: deps.logger,
    ...(deps.origins === undefined ? {} : { origins: deps.origins }),
    ...deps.inbound,
  })
  const replies = new ChannelReplies({
    db: deps.db,
    cache: deps.cache,
    logger: deps.logger,
    repository,
    runs: { repository: deps.runs.repository, queries: deps.runs.queries },
    access: deps.access,
    connections: deps.connections,
    http: deps.http,
    history,
    ...(deps.origins === undefined ? {} : { origins: deps.origins }),
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
      webhooks: new ChannelWebhooksController(inbound),
    }),
    /** Slack and WhatsApp answers when a run finishes; channels of an expired connection go to `error`. */
    replies,
    outboxHandlers: replies.handlers(),
    /** `/widget/v1/widget.js`, registered outside `/api/v1`. */
    scriptRoutes: widgetScriptRoutes(widgetController),
  }
}
export type AgentPublishingModule = ReturnType<typeof createAgentPublishingModule>
