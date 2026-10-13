// SPDX-License-Identifier: AGPL-3.0-only
import { ForbiddenError } from '@/core/errors/index.js'
import {
  decodeCursor,
  encodeCursor,
  parseSort,
  toPage,
  type KeysetCursor,
} from '@/lib/pagination.js'
import { AGENT_AUDIT_ACTIONS, createEmptyAgentDefinition, ERROR_CODES } from '@surefy/contracts'
import type {
  AgentDetailDto,
  AgentDraftDto,
  AgentDto,
  AgentImpactDto,
  AgentImpactQuery,
  CreateAgentInput,
  DeleteAgentQuery,
  DuplicateAgentInput,
  ListAgentsQuery,
  ListUsableAgentsQuery,
  SaveAgentDraftDto,
  SaveAgentDraftInput,
  UpdateAgentInput,
  UsableAgentDto,
} from '@surefy/contracts'

import { canDelete, viewerOf } from './agents.access.js'
import {
  AgentDeleteConfirmationError,
  AgentEditForbiddenError,
  AgentLimitReachedError,
  AgentNotEditableError,
  AgentNotFoundError,
  AgentNotPublishedError,
  AgentStateInvalidError,
} from './agents.errors.js'
import { agentSort } from './agents.repository.js'

import type { AgentDrafts } from './agents.drafts.js'
import type { AgentPresenter } from './agents.presenter.js'
import type {
  AgentListRow,
  AgentRow,
  AgentSortField,
  AgentsRepository,
} from './agents.repository.js'
import type {
  AgentApprovals,
  AgentChannels,
  AgentDependencies,
  AgentRuns,
  AgentsContext,
  AgentsModels,
  AgentsOrganizations,
} from './agents.types.js'
import type { Database, DbExecutor } from '@/core/database/index.js'
import type { AuditRecorder } from '@/modules/audit/index.js'
import type { TemplatesService } from '@/modules/templates/index.js'

export interface AgentsServiceDeps {
  db: Database
  repository: AgentsRepository
  presenter: AgentPresenter
  drafts: AgentDrafts
  templates: Pick<TemplatesService, 'definitionFor' | 'preferredModelKeys'>
  models: AgentsModels
  organizations: AgentsOrganizations
  channels: AgentChannels
  dependencies: AgentDependencies
  runs: AgentRuns
  approvals: AgentApprovals
  audit: AuditRecorder
  /** The clock; tests pass a fixed one. */
  now?: () => Date
}

/** Rows read per round while the "Needs attention" filter looks for matches, and the most rows it reads. */
const ATTENTION_BATCH = 100
const ATTENTION_SCAN_MAX = 1000

/** The agents of an organization: the list, creating, lifecycle and deleting (agents-and-runs.md). */
export class AgentsService {
  constructor(private readonly deps: AgentsServiceDeps) {}

  private now(): Date {
    return this.deps.now?.() ?? new Date()
  }

  // ── Reading ───────────────────────────────────────────────────────────────────────────────────

  /**
   * The Agents list. Builders and Admins see agents they own or that are shared with them (all of
   * them with `agents:manage-all`); archived ones only under the archived filter.
   */
  async list(
    ctx: AgentsContext,
    query: ListAgentsQuery,
  ): Promise<{ items: AgentDto[]; nextCursor: string | null }> {
    const { field, descending } = parseSort<AgentSortField>(query.sort, '-lastRunAt')
    const filters = {
      sort: agentSort(field, descending),
      viewer: viewerOf(ctx),
      ...(query.status === undefined ? {} : { statuses: query.status }),
      ...(query.ownerId === undefined ? {} : { ownerId: query.ownerId }),
      ...(query.mine === undefined ? {} : { mine: query.mine }),
      ...(query.q === undefined ? {} : { q: query.q }),
    }
    return this.deps.db.tenant(ctx.orgId, async (tx) => {
      if (query.needsAttention !== true) {
        const rows = await this.deps.repository.listPage(tx, ctx.orgId, {
          ...filters,
          limit: query.limit,
          ...(query.cursor === undefined ? {} : { cursor: decodeCursor(query.cursor) }),
        })
        const page = toPage(rows, query.limit, (row) => ({ k: row.sortKey, id: row.agent.id }))
        return {
          items: await this.deps.presenter.cards(tx, ctx, page.items),
          nextCursor: page.nextCursor,
        }
      }
      return this.listNeedingAttention(tx, ctx, query, filters)
    })
  }

  /**
   * "Needs attention" is computed per agent, never stored, so it reads rows in batches and keeps
   * the ones with a reason until the page is full or the rows run out.
   */
  private async listNeedingAttention(
    tx: DbExecutor,
    ctx: AgentsContext,
    query: ListAgentsQuery,
    filters: Omit<Parameters<AgentsRepository['listPage']>[2], 'limit' | 'cursor'>,
  ) {
    const matches: { card: AgentDto; key: KeysetCursor }[] = []
    let cursor = query.cursor === undefined ? undefined : decodeCursor(query.cursor)
    let scanned = 0
    let more = true
    while (more && matches.length <= query.limit && scanned < ATTENTION_SCAN_MAX) {
      const batch = await this.scanBatch(tx, ctx, filters, cursor)
      matches.push(...batch.matches)
      scanned += batch.size
      more = batch.more
      cursor = batch.last
    }
    const items = matches.slice(0, query.limit)
    const lastItem = items.at(-1)
    const full = matches.length > query.limit && lastItem !== undefined
    const resumeAt = full ? lastItem.key : cursor
    return {
      items: items.map((match) => match.card),
      nextCursor: resumeAt === undefined || !(full || more) ? null : encodeCursor(resumeAt),
    }
  }

  /** One batch of rows after `cursor`, with the cards that have a reason to be looked at. */
  private async scanBatch(
    tx: DbExecutor,
    ctx: AgentsContext,
    filters: Omit<Parameters<AgentsRepository['listPage']>[2], 'limit' | 'cursor'>,
    cursor: KeysetCursor | undefined,
  ) {
    const rows = await this.deps.repository.listPage(tx, ctx.orgId, {
      ...filters,
      limit: ATTENTION_BATCH,
      ...(cursor === undefined ? {} : { cursor }),
    })
    const batch = rows.slice(0, ATTENTION_BATCH)
    const cards = await this.deps.presenter.cards(tx, ctx, batch)
    const matches = batch.flatMap((row, index) => {
      const card = cards[index]
      return card !== undefined && card.needsAttention.length > 0
        ? [{ card, key: { k: row.sortKey, id: row.agent.id } }]
        : []
    })
    const last = batch.at(-1)
    return {
      matches,
      size: batch.length,
      more: rows.length > ATTENTION_BATCH,
      last: last === undefined ? cursor : { k: last.sortKey, id: last.agent.id },
    }
  }

  /** The agents a person may talk to: published, running, and shared with them or theirs. */
  async listUsable(
    ctx: AgentsContext,
    query: ListUsableAgentsQuery,
  ): Promise<{ items: UsableAgentDto[]; nextCursor: string | null }> {
    return this.deps.db.tenant(ctx.orgId, async (tx) => {
      const rows = await this.deps.repository.listUsable(tx, ctx.orgId, {
        limit: query.limit,
        viewer: viewerOf(ctx),
        ...(query.cursor === undefined ? {} : { cursor: decodeCursor(query.cursor) }),
        ...(query.q === undefined ? {} : { q: query.q }),
      })
      const page = toPage(rows, query.limit, (row) => ({ k: row.sortKey, id: row.agent.id }))
      const models = await this.deps.models.refs(
        tx,
        ctx.orgId,
        page.items.map((row) => row.liveDefinition.model.modelKey),
      )
      return {
        items: page.items.map((row) => ({
          id: row.agent.id,
          name: row.agent.name,
          description: row.agent.description,
          conversationStarters: row.liveDefinition.conversationStarters,
          model: models.get(row.liveDefinition.model.modelKey) ?? null,
        })),
        nextCursor: page.nextCursor,
      }
    })
  }

  async get(ctx: AgentsContext, agentId: string): Promise<AgentDetailDto> {
    return this.deps.db.tenant(ctx.orgId, async (tx) => {
      const row = await this.deps.repository.findRow(tx, ctx.orgId, agentId, viewerOf(ctx))
      if (row === undefined) throw new AgentNotFoundError()
      return this.deps.presenter.detail(tx, ctx, row)
    })
  }

  async getDraft(ctx: AgentsContext, agentId: string): Promise<AgentDraftDto> {
    return this.deps.db.tenant(ctx.orgId, async (tx) => {
      const found = await this.deps.repository.findVisible(tx, ctx.orgId, agentId, viewerOf(ctx))
      if (found === undefined) throw new AgentNotFoundError()
      return this.deps.presenter.draft(found.agent)
    })
  }

  // ── Creating and editing ──────────────────────────────────────────────────────────────────────

  /** From a template, or from scratch. Counts toward `maxAgents`. */
  async create(ctx: AgentsContext, input: CreateAgentInput): Promise<AgentDetailDto> {
    return this.deps.db.tenant(ctx.orgId, async (tx) => {
      await this.assertRoomForAnother(tx, ctx)
      const modelKey = await this.chooseModel(tx, ctx, input)
      const definition =
        input.templateKey === undefined
          ? createEmptyAgentDefinition(modelKey)
          : await this.deps.templates.definitionFor(tx, ctx.orgId, input.templateKey, modelKey)
      const agent = await this.deps.repository.insert(tx, {
        organizationId: ctx.orgId,
        name: input.name,
        description: input.description ?? null,
        ownerUserId: ctx.userId,
        draftDefinition: definition,
        draftUpdatedByUserId: ctx.userId,
        templateKey: input.templateKey ?? null,
        createdByUserId: ctx.userId,
      })
      await this.deps.dependencies.replace(tx, ctx.orgId, agent.id, 'draft', definition)
      await this.deps.audit.record(tx, ctx, {
        action: AGENT_AUDIT_ACTIONS.AGENT_CREATED,
        target: { type: 'agent', id: agent.id },
        metadata: {
          labels: { template: input.templateKey ?? null },
          refs: { modelKey },
        },
      })
      return this.detailOf(tx, ctx, agent.id)
    })
  }

  /** Name and description are live metadata: saved directly, not versioned. */
  async update(ctx: AgentsContext, agentId: string, input: UpdateAgentInput): Promise<AgentDto> {
    return this.deps.db.tenant(ctx.orgId, async (tx) => {
      const agent = await this.lockEditable(tx, ctx, agentId)
      const changes = [
        ...(input.name !== undefined && input.name !== agent.name
          ? [{ field: 'name', from: agent.name, to: input.name }]
          : []),
        ...(input.description !== undefined && input.description !== agent.description
          ? [{ field: 'description', from: agent.description, to: input.description }]
          : []),
      ]
      if (changes.length > 0) {
        await this.deps.repository.updateMetadata(tx, ctx.orgId, agentId, input)
        await this.deps.audit.record(tx, ctx, {
          action: AGENT_AUDIT_ACTIONS.AGENT_UPDATED,
          target: { type: 'agent', id: agentId },
          metadata: { changes },
        })
      }
      return this.cardOf(tx, ctx, agentId)
    })
  }

  /** The autosave. A moved draft is `AGENT_EDIT_CONFLICT`, an archived agent `AGENT_NOT_EDITABLE`. */
  async saveDraft(
    ctx: AgentsContext,
    agentId: string,
    input: SaveAgentDraftInput,
  ): Promise<SaveAgentDraftDto> {
    return this.deps.db.tenant(ctx.orgId, async (tx) => {
      const found = await this.deps.repository.findVisible(tx, ctx.orgId, agentId, viewerOf(ctx))
      if (found === undefined) throw new AgentNotFoundError()
      if (!found.canEdit) throw new AgentEditForbiddenError()
      if (found.agent.status === 'archived') throw new AgentNotEditableError()
      const saved = await this.deps.drafts.save(tx, ctx, found.agent, input)
      await this.deps.dependencies.replace(tx, ctx.orgId, agentId, 'draft', input.definition)
      return saved
    })
  }

  /** A draft copy owned by the caller, with no channels and no audience. */
  async duplicate(
    ctx: AgentsContext,
    agentId: string,
    input: DuplicateAgentInput,
  ): Promise<AgentDetailDto> {
    return this.deps.db.tenant(ctx.orgId, async (tx) => {
      const found = await this.deps.repository.findVisible(tx, ctx.orgId, agentId, viewerOf(ctx))
      if (found === undefined) throw new AgentNotFoundError()
      await this.assertRoomForAnother(tx, ctx)
      const source = found.agent
      const copy = await this.deps.repository.insert(tx, {
        organizationId: ctx.orgId,
        name: input.name ?? `${source.name} (copy)`.slice(0, 120),
        description: source.description,
        ownerUserId: ctx.userId,
        draftDefinition: source.draftDefinition,
        draftUpdatedByUserId: ctx.userId,
        templateKey: source.templateKey,
        createdByUserId: ctx.userId,
      })
      await this.deps.dependencies.replace(tx, ctx.orgId, copy.id, 'draft', copy.draftDefinition)
      await this.deps.audit.record(tx, ctx, {
        action: AGENT_AUDIT_ACTIONS.AGENT_CREATED,
        target: { type: 'agent', id: copy.id },
        metadata: { refs: { copiedFrom: source.id } },
      })
      return this.detailOf(tx, ctx, copy.id)
    })
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────────────────────────────

  /** `active → paused`: channels stop answering and no new run starts. */
  async pause(ctx: AgentsContext, agentId: string): Promise<AgentDto> {
    return this.deps.db.tenant(ctx.orgId, async (tx) => {
      const agent = await this.lockEditable(tx, ctx, agentId)
      if (agent.status === 'draft') throw new AgentNotPublishedError()
      if (agent.status !== 'active') throw new AgentStateInvalidError(agent.status, 'paused')
      await this.deps.repository.setStatus(tx, ctx.orgId, agentId, {
        status: 'paused',
        pausedAt: this.now(),
      })
      await this.record(tx, ctx, AGENT_AUDIT_ACTIONS.AGENT_PAUSED, agentId)
      return this.cardOf(tx, ctx, agentId)
    })
  }

  async resume(ctx: AgentsContext, agentId: string): Promise<AgentDto> {
    return this.deps.db.tenant(ctx.orgId, async (tx) => {
      const agent = await this.lockEditable(tx, ctx, agentId)
      if (agent.status !== 'paused') throw new AgentStateInvalidError(agent.status, 'resumed')
      await this.deps.repository.setStatus(tx, ctx.orgId, agentId, {
        status: 'active',
        pausedAt: null,
      })
      await this.record(tx, ctx, AGENT_AUDIT_ACTIONS.AGENT_RESUMED, agentId)
      return this.cardOf(tx, ctx, agentId)
    })
  }

  /** Any state `→ archived`: the editor turns read-only and channels stop answering. */
  async archive(ctx: AgentsContext, agentId: string): Promise<AgentDto> {
    return this.deps.db.tenant(ctx.orgId, async (tx) => {
      const agent = await this.lockVisibleEditor(tx, ctx, agentId)
      if (agent.status === 'archived') throw new AgentStateInvalidError(agent.status, 'archived')
      await this.deps.repository.setStatus(tx, ctx.orgId, agentId, {
        status: 'archived',
        archivedAt: this.now(),
      })
      await this.record(tx, ctx, AGENT_AUDIT_ACTIONS.AGENT_ARCHIVED, agentId)
      return this.cardOf(tx, ctx, agentId)
    })
  }

  /** `archived → paused` for an agent that was ever published, else `draft`. Counts toward `maxAgents` again. */
  async restore(ctx: AgentsContext, agentId: string): Promise<AgentDto> {
    return this.deps.db.tenant(ctx.orgId, async (tx) => {
      const agent = await this.lockVisibleEditor(tx, ctx, agentId)
      if (agent.status !== 'archived') throw new AgentStateInvalidError(agent.status, 'restored')
      await this.assertRoomForAnother(tx, ctx)
      const published = agent.liveVersionId !== null
      await this.deps.repository.setStatus(tx, ctx.orgId, agentId, {
        status: published ? 'paused' : 'draft',
        archivedAt: null,
        pausedAt: published ? this.now() : null,
      })
      await this.record(tx, ctx, AGENT_AUDIT_ACTIONS.AGENT_RESTORED, agentId)
      return this.cardOf(tx, ctx, agentId)
    })
  }

  /** What the T2 and T3 dialogs say before pausing, archiving or deleting. */
  async impact(
    ctx: AgentsContext,
    agentId: string,
    _query: AgentImpactQuery,
  ): Promise<AgentImpactDto> {
    return this.deps.db.tenant(ctx.orgId, async (tx) => {
      const found = await this.deps.repository.findVisible(tx, ctx.orgId, agentId, viewerOf(ctx))
      if (found === undefined) throw new AgentNotFoundError()
      const [audiences, channels, runCount, waiting, published] = await Promise.all([
        this.deps.presenter.audiences(tx, ctx.orgId, [agentId]),
        this.deps.channels.list(tx, ctx.orgId, [agentId]),
        this.deps.runs.countRuns(tx, ctx.orgId, agentId),
        this.deps.approvals.waitingCounts(tx, ctx.orgId, [agentId]),
        this.deps.repository.hasVersions(tx, ctx.orgId, agentId),
      ])
      return {
        sharedWith: audiences.get(agentId) ?? {
          everyone: false,
          teams: [],
          teamCount: 0,
          userCount: 0,
        },
        activeChannels: (channels.get(agentId) ?? [])
          .filter((channel) => channel.status === 'active')
          .map((channel) => ({ id: channel.id, type: channel.type })),
        runCount,
        pendingApprovals: waiting.get(agentId) ?? 0,
        deleteRequiresConfirmation: published || runCount > 0,
      }
    })
  }

  /**
   * A never-published agent without runs is deleted outright. Otherwise it becomes a tombstone:
   * hidden, its channels disconnected and its audience removed, with the name typed and a reason.
   */
  async delete(ctx: AgentsContext, agentId: string, query: DeleteAgentQuery): Promise<void> {
    await this.deps.db.tenant(ctx.orgId, async (tx) => {
      const found = await this.deps.repository.lockVisible(tx, ctx.orgId, agentId, viewerOf(ctx))
      if (found === undefined) throw new AgentNotFoundError()
      const agent = found.agent
      if (!canDelete(ctx, agent.ownerUserId)) throw new ForbiddenError(ERROR_CODES.ACCESS_FORBIDDEN)
      const [published, runCount] = await Promise.all([
        this.deps.repository.hasVersions(tx, ctx.orgId, agentId),
        this.deps.runs.countRuns(tx, ctx.orgId, agentId),
      ])
      const tombstone = published || runCount > 0
      if (tombstone) {
        if (query.confirmName !== agent.name) throw new AgentDeleteConfirmationError('confirmName')
        if (query.reason === undefined) throw new AgentDeleteConfirmationError('reason')
        await this.deps.channels.disconnectAll(tx, ctx, agentId)
        await this.deps.repository.tombstone(tx, ctx.orgId, agentId, this.now())
        await this.deps.organizations.bumpAccessVersionInTx(tx, ctx.orgId)
      } else {
        await this.deps.repository.delete(tx, ctx.orgId, agentId)
      }
      await this.deps.dependencies.remove(tx, ctx.orgId, agentId)
      await this.deps.audit.record(tx, ctx, {
        action: AGENT_AUDIT_ACTIONS.AGENT_DELETED,
        target: { type: 'agent', id: agentId },
        reason: query.reason ?? null,
        metadata: { labels: { tombstone }, counts: { runs: runCount } },
      })
    })
  }

  // ── Helpers ───────────────────────────────────────────────────────────────────────────────────

  private record(tx: DbExecutor, ctx: AgentsContext, action: string, agentId: string) {
    return this.deps.audit.record(tx, ctx, { action, target: { type: 'agent', id: agentId } })
  }

  private async cardOf(tx: DbExecutor, ctx: AgentsContext, agentId: string): Promise<AgentDto> {
    const row = await this.deps.repository.findRow(tx, ctx.orgId, agentId, viewerOf(ctx))
    if (row === undefined) throw new AgentNotFoundError()
    const [card] = await this.deps.presenter.cards(tx, ctx, [row])
    if (card === undefined) throw new AgentNotFoundError()
    return card
  }

  private async detailOf(tx: DbExecutor, ctx: AgentsContext, agentId: string) {
    const row: AgentListRow | undefined = await this.deps.repository.findRow(
      tx,
      ctx.orgId,
      agentId,
      viewerOf(ctx),
    )
    if (row === undefined) throw new AgentNotFoundError()
    return this.deps.presenter.detail(tx, ctx, row)
  }

  /** The row, locked, when the person may edit it; archived agents are still returned (restore, delete). */
  private async lockVisibleEditor(
    tx: DbExecutor,
    ctx: AgentsContext,
    agentId: string,
  ): Promise<AgentRow> {
    const found = await this.deps.repository.lockVisible(tx, ctx.orgId, agentId, viewerOf(ctx))
    if (found === undefined) throw new AgentNotFoundError()
    if (!found.canEdit) throw new AgentEditForbiddenError()
    return found.agent
  }

  /** Like `lockVisibleEditor`, but an archived agent is read-only. */
  private async lockEditable(
    tx: DbExecutor,
    ctx: AgentsContext,
    agentId: string,
  ): Promise<AgentRow> {
    const agent = await this.lockVisibleEditor(tx, ctx, agentId)
    if (agent.status === 'archived') throw new AgentNotEditableError()
    return agent
  }

  /** The plan or license allows `maxAgents` agents that are not archived or deleted. */
  private async assertRoomForAnother(tx: DbExecutor, ctx: AgentsContext): Promise<void> {
    const max = ctx.access.limits.maxAgents
    if (max === null) return
    await this.deps.repository.lockCount(tx, ctx.orgId)
    const used = await this.deps.repository.countCounting(tx, ctx.orgId)
    if (used < max) return
    const source = ctx.access.reasons.find((reason) => reason.key === 'limit:maxAgents')?.source
    throw new AgentLimitReachedError({
      limit: 'maxAgents',
      max,
      used,
      source: source ?? 'plan',
    })
  }

  /** The model of a new agent: the one asked for, else the template's pick, else the first allowed. */
  private async chooseModel(
    tx: DbExecutor,
    ctx: AgentsContext,
    input: CreateAgentInput,
  ): Promise<string> {
    const allowed = await this.deps.models.allowedFor(tx, ctx)
    const keys = allowed.map((model) => model.modelKey)
    if (input.modelKey !== undefined) {
      if (!keys.includes(input.modelKey)) {
        throw new ForbiddenError(ERROR_CODES.MODEL_NOT_ALLOWED, 'You cannot use this model')
      }
      return input.modelKey
    }
    const preferred =
      input.templateKey === undefined
        ? undefined
        : this.deps.templates
            .preferredModelKeys(input.templateKey)
            .find((key) => keys.includes(key))
    const chosen = preferred ?? keys[0]
    if (chosen === undefined) {
      throw new ForbiddenError(ERROR_CODES.MODEL_NOT_ALLOWED, 'No model is available to you')
    }
    return chosen
  }
}
