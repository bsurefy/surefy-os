// SPDX-License-Identifier: AGPL-3.0-only
import type {
  AgentDefinition,
  SaveAgentDraftDto,
  SaveAgentDraftInput,
  UserRefDto,
} from '@surefy/contracts'

import {
  AgentEditConflictError,
  AgentNotEditableError,
  AgentNotFoundError,
} from './agents.errors.js'

import type { AgentRow, AgentsRepository } from './agents.repository.js'
import type { AgentsConnections, AgentsContext, AgentsUserRefs } from './agents.types.js'
import type { DbExecutor } from '@/core/database/index.js'

export interface AgentDraftsDeps {
  repository: AgentsRepository
  connections: AgentsConnections
  users: AgentsUserRefs
}

/** Every connection a definition's tools name, enabled or not. */
export function allConnectionIds(definition: AgentDefinition): Set<string> {
  const ids = new Set<string>()
  for (const tool of definition.tools) {
    if ('connectionId' in tool && tool.connectionId !== null) ids.add(tool.connectionId)
  }
  return ids
}

/**
 * The draft of an agent (agents-and-runs.md › Draft, live and the edit-conflict check): the
 * autosave guarded by the client's base revision, and the conflict answer both the autosave and
 * the publish give when the draft moved.
 */
export class AgentDrafts {
  constructor(private readonly deps: AgentDraftsDeps) {}

  /**
   * One guarded statement. A connection newly named by a tool must be one the person may use and
   * that works; connections the draft already held are left alone, so a revoked one does not
   * block saving everything else.
   */
  async save(
    tx: DbExecutor,
    ctx: AgentsContext,
    current: AgentRow,
    input: SaveAgentDraftInput,
  ): Promise<SaveAgentDraftDto> {
    const held = allConnectionIds(current.draftDefinition)
    for (const connectionId of allConnectionIds(input.definition)) {
      if (held.has(connectionId)) continue
      await this.deps.connections.assertUsable(
        tx,
        ctx.orgId,
        { userId: ctx.userId, teamIds: ctx.teamIds },
        connectionId,
      )
    }
    const saved = await this.deps.repository.saveDraft(tx, ctx.orgId, current.id, {
      baseRevision: input.baseRevision,
      definition: input.definition,
      userId: ctx.userId,
    })
    if (saved === undefined) throw await this.whyNotSaved(tx, ctx.orgId, current.id)
    return {
      revision: saved.revision,
      updatedAt: saved.updatedAt.toISOString(),
      hasUnpublishedChanges: saved.hasUnpublishedChanges,
    }
  }

  /**
   * The error for a save or publish that matched no row: the agent went away or was archived, or
   * the draft moved, and the answer carries who changed it and, after a publish, which version.
   */
  async whyNotSaved(tx: DbExecutor, orgId: string, agentId: string): Promise<Error> {
    const agent = await this.deps.repository.findById(tx, orgId, agentId)
    if (agent?.deletedAt !== null) return new AgentNotFoundError()
    if (agent.status === 'archived') return new AgentNotEditableError()
    return this.conflict(tx, agent)
  }

  async conflict(tx: DbExecutor, agent: AgentRow): Promise<AgentEditConflictError> {
    const [latest] = await this.deps.repository.listVersions(tx, agent.organizationId, agent.id, {
      limit: 1,
    })
    const users =
      agent.draftUpdatedByUserId === null
        ? new Map<string, UserRefDto>()
        : await this.deps.users.findUserRefs([agent.draftUpdatedByUserId])
    // a publish moves the draft's timestamp to its own transaction time
    const publishedVersion =
      latest?.version.publishedAt.getTime() === agent.draftUpdatedAt.getTime()
        ? latest.version.version
        : null
    return new AgentEditConflictError({
      currentRevision: agent.draftRevision,
      updatedAt: agent.draftUpdatedAt.toISOString(),
      updatedBy:
        agent.draftUpdatedByUserId === null
          ? null
          : (users.get(agent.draftUpdatedByUserId) ?? null),
      publishedVersion,
    })
  }
}
