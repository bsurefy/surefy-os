// SPDX-License-Identifier: AGPL-3.0-only
import { decodeCursor, toPage } from '@/lib/pagination.js'
import { AGENT_AUDIT_ACTIONS, diffAgentDefinitions, PERMISSIONS } from '@surefy/contracts'
import type {
  AgentDiffDto,
  AgentDiffQuery,
  AgentDto,
  AgentReadinessDto,
  AgentVersionDetailDto,
  AgentVersionDto,
  ListAgentVersionsQuery,
  PublishAgentInput,
  PublishAgentResultDto,
  RollbackAgentInput,
} from '@surefy/contracts'

import { hasPermission, viewerOf } from './agents.access.js'
import { entriesOf } from './agents.audience.js'
import {
  AgentEditForbiddenError,
  AgentNotEditableError,
  AgentNotFoundError,
  AgentNotPublishedError,
  AgentNotReadyError,
  AgentVersionNotFoundError,
} from './agents.errors.js'

import type { AgentAudience } from './agents.audience.js'
import type { AgentDrafts } from './agents.drafts.js'
import type { AgentPresenter } from './agents.presenter.js'
import type { AgentReadiness } from './agents.readiness.js'
import type { AgentRow, AgentsRepository } from './agents.repository.js'
import type {
  AgentChannels,
  AgentDependencies,
  AgentsContext,
  AgentsOutbox,
} from './agents.types.js'
import type { Database, DbExecutor } from '@/core/database/index.js'
import type { AuditRecorder } from '@/modules/audit/index.js'

export interface AgentPublishingDeps {
  db: Database
  repository: AgentsRepository
  presenter: AgentPresenter
  drafts: AgentDrafts
  readiness: AgentReadiness
  audience: AgentAudience
  channels: AgentChannels
  dependencies: AgentDependencies
  audit: AuditRecorder
  outbox: AgentsOutbox
}

/**
 * Versions, readiness, publishing and rolling back (agents-and-runs.md › Publish transaction).
 * A version is an immutable copy of the draft; a roll back points the live version at an earlier
 * one and creates none. Runs on channels always use the live version.
 */
export class AgentPublishing {
  constructor(private readonly deps: AgentPublishingDeps) {}

  // ── Readiness ─────────────────────────────────────────────────────────────────────────────────

  /** The checklist of the Publish tab, for the audience the agent has now. */
  async readiness(ctx: AgentsContext, agentId: string): Promise<AgentReadinessDto> {
    return this.deps.db.tenant(ctx.orgId, async (tx) => {
      const found = await this.deps.repository.findVisible(tx, ctx.orgId, agentId, viewerOf(ctx))
      if (found === undefined) throw new AgentNotFoundError()
      const audience = entriesOf(await this.deps.repository.listAccess(tx, ctx.orgId, agentId))
      return this.deps.readiness.check(tx, ctx.orgId, found.agent, audience)
    })
  }

  // ── Publish ───────────────────────────────────────────────────────────────────────────────────

  /**
   * One transaction: the readiness checks, the next version, the live pointer, the audience, the
   * channels, the dependency edges, the audit entry and the event. If anything fails, nothing
   * changes and the previous version stays live.
   */
  async publish(
    ctx: AgentsContext,
    agentId: string,
    input: PublishAgentInput,
  ): Promise<PublishAgentResultDto> {
    const result = await this.deps.db.tenant(ctx.orgId, async (tx) => {
      const found = await this.deps.repository.lockVisible(tx, ctx.orgId, agentId, viewerOf(ctx))
      if (found === undefined) throw new AgentNotFoundError()
      if (!found.canEdit) throw new AgentEditForbiddenError()
      const agent = found.agent
      if (agent.status === 'archived') throw new AgentNotEditableError()
      if (agent.draftRevision !== input.baseRevision) {
        throw await this.deps.drafts.conflict(tx, agent)
      }
      const audience =
        input.access ?? entriesOf(await this.deps.repository.listAccess(tx, ctx.orgId, agentId))
      const readiness = await this.deps.readiness.check(tx, ctx.orgId, agent, audience)
      if (!readiness.canPublish) throw new AgentNotReadyError(readiness)

      const version = await this.deps.repository.insertVersion(tx, {
        organizationId: ctx.orgId,
        agentId,
        version: await this.deps.repository.nextVersion(tx, ctx.orgId, agentId),
        definition: agent.draftDefinition,
        notes: input.notes ?? null,
        publishedByUserId: ctx.userId,
      })
      const published = await this.deps.repository.applyPublish(
        tx,
        ctx.orgId,
        agentId,
        version.id,
        ctx.userId,
      )
      if (input.access !== undefined) {
        await this.deps.audience.apply(tx, ctx, published, input.access, { checkModel: false })
      }
      const { channels, widgetTokens } = await this.deps.channels.publish(
        tx,
        ctx,
        { id: agentId, name: agent.name, ownerUserId: agent.ownerUserId },
        {
          channels: input.channels,
          external: hasPermission(ctx, PERMISSIONS.AGENTS_PUBLISH_EXTERNAL),
        },
      )
      await this.deps.dependencies.replace(tx, ctx.orgId, agentId, 'live', version.definition)
      await this.deps.audit.record(tx, ctx, {
        action: AGENT_AUDIT_ACTIONS.AGENT_PUBLISHED,
        target: { type: 'agent', id: agentId },
        metadata: {
          counts: {
            version: version.version,
            notesLength: input.notes?.length ?? 0,
            channels: input.channels.length,
          },
        },
      })
      await this.announce(tx, ctx.orgId, agentId)
      const [versionDto] = await this.deps.presenter.versions([version], published.liveVersionId)
      const card = await this.cardOf(tx, ctx, agentId)
      if (versionDto === undefined) throw new Error('version dto missing')
      return { agent: card, version: versionDto, channels: [...channels], widgetTokens }
    })
    await this.deps.outbox.kick()
    return { ...result, widgetTokens: { ...result.widgetTokens } }
  }

  /** Points the live version at an earlier one; the draft is untouched and now differs from live. */
  async rollback(
    ctx: AgentsContext,
    agentId: string,
    input: RollbackAgentInput,
  ): Promise<AgentDto> {
    const card = await this.deps.db.tenant(ctx.orgId, async (tx) => {
      const found = await this.deps.repository.lockVisible(tx, ctx.orgId, agentId, viewerOf(ctx))
      if (found === undefined) throw new AgentNotFoundError()
      if (!found.canEdit) throw new AgentEditForbiddenError()
      const agent = found.agent
      if (agent.status === 'archived') throw new AgentNotEditableError()
      if (agent.liveVersionId === null) throw new AgentNotPublishedError()
      const target = await this.deps.repository.findVersion(tx, ctx.orgId, agentId, input.versionId)
      if (target === undefined) throw new AgentVersionNotFoundError()
      if (target.id !== agent.liveVersionId) {
        const current = await this.deps.repository.findVersion(
          tx,
          ctx.orgId,
          agentId,
          agent.liveVersionId,
        )
        await this.deps.repository.applyRollback(tx, ctx.orgId, agentId, target.id)
        await this.deps.dependencies.replace(tx, ctx.orgId, agentId, 'live', target.definition)
        await this.deps.audit.record(tx, ctx, {
          action: AGENT_AUDIT_ACTIONS.AGENT_ROLLED_BACK,
          target: { type: 'agent', id: agentId },
          metadata: { counts: { from: current?.version ?? 0, to: target.version } },
        })
        await this.announce(tx, ctx.orgId, agentId)
      }
      return this.cardOf(tx, ctx, agentId)
    })
    await this.deps.outbox.kick()
    return card
  }

  // ── Versions ──────────────────────────────────────────────────────────────────────────────────

  /** Newest first. */
  async listVersions(
    ctx: AgentsContext,
    agentId: string,
    query: ListAgentVersionsQuery,
  ): Promise<{ items: AgentVersionDto[]; nextCursor: string | null }> {
    return this.deps.db.tenant(ctx.orgId, async (tx) => {
      const agent = await this.visibleAgent(tx, ctx, agentId)
      const rows = await this.deps.repository.listVersions(tx, ctx.orgId, agentId, {
        limit: query.limit,
        ...(query.cursor === undefined ? {} : { cursor: decodeCursor(query.cursor) }),
      })
      const page = toPage(rows, query.limit, (row) => ({ k: row.sortKey, id: row.version.id }))
      return {
        items: await this.deps.presenter.versions(
          page.items.map((row) => row.version),
          agent.liveVersionId,
        ),
        nextCursor: page.nextCursor,
      }
    })
  }

  async getVersion(
    ctx: AgentsContext,
    agentId: string,
    versionId: string,
  ): Promise<AgentVersionDetailDto> {
    return this.deps.db.tenant(ctx.orgId, async (tx) => {
      const agent = await this.visibleAgent(tx, ctx, agentId)
      const version = await this.deps.repository.findVersion(tx, ctx.orgId, agentId, versionId)
      if (version === undefined) throw new AgentVersionNotFoundError()
      const [dto] = await this.deps.presenter.versions([version], agent.liveVersionId)
      if (dto === undefined) throw new Error('version dto missing')
      return { ...dto, definition: version.definition }
    })
  }

  /**
   * What changes going from this version to `against` (the draft, the live version or another
   * version): the Publish tab asks for the live version against the draft.
   */
  async diff(
    ctx: AgentsContext,
    agentId: string,
    versionId: string,
    query: AgentDiffQuery,
  ): Promise<AgentDiffDto> {
    return this.deps.db.tenant(ctx.orgId, async (tx) => {
      const agent = await this.visibleAgent(tx, ctx, agentId)
      const version = await this.deps.repository.findVersion(tx, ctx.orgId, agentId, versionId)
      if (version === undefined) throw new AgentVersionNotFoundError()
      const otherId = comparedWith(agent, query.against)
      if (query.against === 'live' && otherId === null) throw new AgentNotPublishedError()
      const other =
        otherId === null
          ? undefined
          : await this.deps.repository.findVersion(tx, ctx.orgId, agentId, otherId)
      if (otherId !== null && other === undefined) throw new AgentVersionNotFoundError()
      return {
        changes: diffAgentDefinitions(
          version.definition,
          other === undefined ? agent.draftDefinition : other.definition,
        ),
      }
    })
  }

  // ── Helpers ───────────────────────────────────────────────────────────────────────────────────

  private async visibleAgent(
    tx: DbExecutor,
    ctx: AgentsContext,
    agentId: string,
  ): Promise<AgentRow> {
    const found = await this.deps.repository.findVisible(tx, ctx.orgId, agentId, viewerOf(ctx))
    if (found === undefined) throw new AgentNotFoundError()
    return found.agent
  }

  private async cardOf(tx: DbExecutor, ctx: AgentsContext, agentId: string): Promise<AgentDto> {
    const row = await this.deps.repository.findRow(tx, ctx.orgId, agentId, viewerOf(ctx))
    const [card] = row === undefined ? [] : await this.deps.presenter.cards(tx, ctx, [row])
    if (card === undefined) throw new AgentNotFoundError()
    return card
  }

  /** The live version changed: whoever caches the live definition drops it. */
  private async announce(tx: DbExecutor, orgId: string, agentId: string): Promise<void> {
    await this.deps.outbox.write(tx, {
      orgId,
      topic: 'agent.published',
      payload: { version: 1, id: agentId },
    })
  }
}

/** The version a diff goes to: the live one, another by id, or null for the draft. */
function comparedWith(agent: AgentRow, against: AgentDiffQuery['against']): string | null {
  if (against === 'draft') return null
  return against === 'live' ? agent.liveVersionId : against
}
