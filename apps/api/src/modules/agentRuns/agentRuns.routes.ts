// SPDX-License-Identifier: AGPL-3.0-only
import { defineGuard } from '@/plugins/access.plugin.js'
import { AGENT_RUNS_PERMISSIONS, PERMISSIONS } from '@surefy/contracts'
import type { Permission } from '@surefy/contracts'

import {
  agentRunEventsRoute,
  cancelAgentRunRoute,
  getAgentRunRoute,
  getAgentRunStepRoute,
  listAgentRunsOfAgentRoute,
  listAgentRunsRoute,
  listAgentRunStepsRoute,
  retryAgentRunRoute,
  startTestRunRoute,
} from './agentRuns.schema.js'

import type { AgentRunsController } from './agentRuns.controller.js'
import type { FastifyInstance } from 'fastify'
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'

/**
 * A guard for a path both a signed-in person and an API key use: the person needs `person`, the key
 * `key`. Which runs either sees is the service's rule, not the permission's.
 */
function eitherGuard(app: FastifyInstance, person: Permission, key: Permission) {
  const asPerson = app.authorize(person)
  const asKey = app.authorize(key)
  return defineGuard('authorize', function (request, reply) {
    return (request.auth?.via === 'api-key' ? asKey : asPerson).call(this, request, reply)
  })
}

/**
 * Run routes (backend/agent-runs.md, §3, §8). Reading and steering a run is shared by the
 * workspace and the API channel: a key reaches `GET /runs/:runId`, its events and cancel for runs
 * it started, and nothing else here. Starting a run over the API is `agentPublishing`'s route.
 */
export function agentRunsRoutes(c: AgentRunsController): FastifyPluginAsyncZod {
  return (app) => {
    const read = app.authorize(AGENT_RUNS_PERMISSIONS.RUNS_READ.key)
    const retry = app.authorize(AGENT_RUNS_PERMISSIONS.RUNS_RETRY.key)
    const edit = app.authorize(PERMISSIONS.AGENTS_EDIT)
    const invoke = app.authorize(PERMISSIONS.AGENTS_INVOKE)
    const detail = eitherGuard(app, AGENT_RUNS_PERMISSIONS.RUNS_READ.key, PERMISSIONS.AGENTS_INVOKE)
    const cancel = eitherGuard(
      app,
      AGENT_RUNS_PERMISSIONS.RUNS_CANCEL.key,
      PERMISSIONS.AGENTS_INVOKE,
    )

    app.get('/orgs/:orgId/runs', { schema: listAgentRunsRoute, preHandler: read }, c.list)
    app.get(
      '/orgs/:orgId/agents/:agentId/runs',
      { schema: listAgentRunsOfAgentRoute, preHandler: read },
      c.listForAgent,
    )
    app.post(
      '/orgs/:orgId/agents/:agentId/test-runs',
      { schema: startTestRunRoute, preHandler: edit },
      c.startTest,
    )
    app.get('/orgs/:orgId/runs/:runId', { schema: getAgentRunRoute, preHandler: detail }, c.get)
    app.get(
      '/orgs/:orgId/runs/:runId/steps',
      { schema: listAgentRunStepsRoute, preHandler: read },
      c.steps,
    )
    app.get(
      '/orgs/:orgId/runs/:runId/steps/:seq',
      { schema: getAgentRunStepRoute, preHandler: read },
      c.step,
    )
    app.get(
      '/orgs/:orgId/runs/:runId/events',
      { schema: agentRunEventsRoute, preHandler: invoke },
      c.events,
    )
    app.post(
      '/orgs/:orgId/runs/:runId/cancel',
      { schema: cancelAgentRunRoute, preHandler: cancel },
      c.cancel,
    )
    app.post(
      '/orgs/:orgId/runs/:runId/retry',
      { schema: retryAgentRunRoute, preHandler: retry },
      c.retry,
    )
    return Promise.resolve()
  }
}
