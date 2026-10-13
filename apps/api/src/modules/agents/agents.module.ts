// SPDX-License-Identifier: AGPL-3.0-only
import { AgentAudience } from './agents.audience.js'
import { AgentsController } from './agents.controller.js'
import { AgentDrafts } from './agents.drafts.js'
import { AgentPresenter } from './agents.presenter.js'
import { AgentPublishing } from './agents.publishing.js'
import { AgentReadiness } from './agents.readiness.js'
import { AgentsRepository } from './agents.repository.js'
import { agentsRoutes } from './agents.routes.js'
import { AgentsService } from './agents.service.js'
import { AgentToolsTry } from './agents.tools.js'
import { NO_APPROVALS, NO_CHANNELS, NO_DEPENDENCIES, NO_RUNS } from './agents.types.js'

import type {
  AgentApprovals,
  AgentChannels,
  AgentDependencies,
  AgentRuns,
  AgentsConnections,
  AgentsGuard,
  AgentsModels,
  AgentsOrganizations,
  AgentsOutbox,
  AgentsToolProbe,
  AgentsTeams,
  AgentsUserRefs,
} from './agents.types.js'
import type { Database } from '@/core/database/index.js'
import type { AuditRecorder } from '@/modules/audit/index.js'
import type { TemplatesService } from '@/modules/templates/index.js'

export interface AgentsModuleDeps {
  db: Database
  teams: AgentsTeams
  users: AgentsUserRefs
  organizations: AgentsOrganizations
  models: AgentsModels
  connections: AgentsConnections
  guard: AgentsGuard
  /** The tool adapters' test call and MCP discovery. */
  toolProbe: AgentsToolProbe
  templates: Pick<TemplatesService, 'definitionFor' | 'preferredModelKeys'>
  audit: AuditRecorder
  /** The outbox service; read when an event is written, because the outbox is built after this. */
  outbox: () => AgentsOutbox
  /** Channels, dependency edges, runs and pending approvals: none until their modules provide them. */
  channels?: AgentChannels
  dependencies?: AgentDependencies
  runs?: AgentRuns
  approvals?: AgentApprovals
}

/**
 * Agents: the draft with its autosave, versions, publishing and rolling back, the audience, the
 * readiness check and the lifecycle (database/agents-and-runs.md). The runs of an agent are the
 * `agentRuns` module's; they always use the live version.
 */
export function createAgentsModule(deps: AgentsModuleDeps) {
  const repository = new AgentsRepository()
  const channels = deps.channels ?? NO_CHANNELS
  const dependencies = deps.dependencies ?? NO_DEPENDENCIES
  const runs = deps.runs ?? NO_RUNS
  const approvals = deps.approvals ?? NO_APPROVALS
  const outbox: AgentsOutbox = {
    write: (tx, event) => deps.outbox().write(tx, event),
    kick: () => deps.outbox().kick(),
  }
  const presenter = new AgentPresenter({
    repository,
    users: deps.users,
    teams: deps.teams,
    models: deps.models,
    connections: deps.connections,
    runs,
    approvals,
    channels,
  })
  const drafts = new AgentDrafts({
    repository,
    connections: deps.connections,
    users: deps.users,
  })
  const readiness = new AgentReadiness({
    models: deps.models,
    connections: deps.connections,
    guard: deps.guard,
    runs,
    teams: deps.teams,
    users: deps.users,
  })
  const audience = new AgentAudience({
    db: deps.db,
    repository,
    presenter,
    readiness,
    teams: deps.teams,
    organizations: deps.organizations,
    audit: deps.audit,
  })
  const service = new AgentsService({
    db: deps.db,
    repository,
    presenter,
    drafts,
    templates: deps.templates,
    models: deps.models,
    organizations: deps.organizations,
    channels,
    dependencies,
    runs,
    approvals,
    audit: deps.audit,
  })
  const publishing = new AgentPublishing({
    db: deps.db,
    repository,
    presenter,
    drafts,
    readiness,
    audience,
    channels,
    dependencies,
    audit: deps.audit,
    outbox,
  })
  return {
    service,
    publishing,
    audience,
    repository,
    routes: agentsRoutes(
      new AgentsController(
        service,
        publishing,
        audience,
        new AgentToolsTry({
          db: deps.db,
          repository,
          connections: deps.connections,
          probe: deps.toolProbe,
        }),
      ),
    ),
  }
}
export type AgentsModule = ReturnType<typeof createAgentsModule>
