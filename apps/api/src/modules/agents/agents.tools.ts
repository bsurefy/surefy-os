// SPDX-License-Identifier: AGPL-3.0-only
import { AppError } from '@/core/errors/index.js'
import { CONNECTIONS_ERROR_CODES } from '@surefy/contracts'
import type {
  DiscoverMcpActionsDto,
  DiscoverMcpActionsInput,
  TestAgentToolDto,
  TestAgentToolInput,
} from '@surefy/contracts'

import { viewerOf } from './agents.access.js'
import {
  AgentEditForbiddenError,
  AgentNotEditableError,
  AgentNotFoundError,
} from './agents.errors.js'

import type { AgentsRepository } from './agents.repository.js'
import type { AgentsConnections, AgentsContext, AgentsToolProbe } from './agents.types.js'
import type { Database } from '@/core/database/index.js'

export interface AgentToolsTryDeps {
  db: Database
  repository: AgentsRepository
  connections: AgentsConnections
  probe: AgentsToolProbe
}

/**
 * Trying a tool from the editor (Agents › Editor › Tools): the person must be able to edit the
 * agent, and the connection must be one they may use. The calls themselves are the tool
 * adapters', made after the check and outside any transaction.
 */
export class AgentToolsTry {
  constructor(private readonly deps: AgentToolsTryDeps) {}

  async test(
    ctx: AgentsContext,
    agentId: string,
    input: TestAgentToolInput,
  ): Promise<TestAgentToolDto> {
    const principal = await this.prepare(ctx, agentId, input.connectionId)
    return this.deps.probe.testApi({ orgId: ctx.orgId, principal }, input)
  }

  async discover(
    ctx: AgentsContext,
    agentId: string,
    input: DiscoverMcpActionsInput,
  ): Promise<DiscoverMcpActionsDto> {
    const principal = await this.prepare(ctx, agentId, input.connectionId)
    return this.deps.probe.discover({ orgId: ctx.orgId, principal }, input)
  }

  private async prepare(ctx: AgentsContext, agentId: string, connectionId: string | null) {
    const principal = { userId: ctx.userId, teamIds: ctx.teamIds }
    await this.deps.db.tenant(ctx.orgId, async (tx) => {
      const found = await this.deps.repository.findVisible(tx, ctx.orgId, agentId, viewerOf(ctx))
      if (found === undefined) throw new AgentNotFoundError()
      if (!found.canEdit) throw new AgentEditForbiddenError()
      if (found.agent.status === 'archived') throw new AgentNotEditableError()
      if (connectionId === null) return
      try {
        await this.deps.connections.assertUsable(tx, ctx.orgId, principal, connectionId)
      } catch (error) {
        // a revoked connection is an answer of the call itself (`CONNECTION_REVOKED`), not an error
        const revoked =
          error instanceof AppError && error.code === CONNECTIONS_ERROR_CODES.CONNECTION_REVOKED
        if (!revoked) throw error
      }
    })
    return principal
  }
}
