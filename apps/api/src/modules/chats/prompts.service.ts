// SPDX-License-Identifier: AGPL-3.0-only
import { decodeCursor, toPage } from '@/lib/pagination.js'
import {
  CHAT_AUDIT_ACTIONS,
  parsePromptVariables,
  PERMISSIONS,
  PROMPT_RESTORE_WINDOW_DAYS,
} from '@surefy/contracts'
import type {
  CreatePromptInput,
  ListPromptsQuery,
  PromptDto,
  TeamRefDto,
  UpdatePromptInput,
  UserRefDto,
} from '@surefy/contracts'

import { requireUser } from './chatContext.js'
import {
  PromptManageForbiddenError,
  PromptNotFoundError,
  PromptTeamNotFoundError,
} from './chats.errors.js'

import type { ChatAudit, ChatUserRefs } from './chats.types.js'
import type {
  PromptPatch,
  PromptRow,
  PromptsRepository,
  PromptViewer,
} from './prompts.repository.js'
import type { Database, DbExecutor } from '@/core/database/index.js'
import type { TenantContext } from '@/types/context.js'

export interface PromptsServiceDeps {
  db: Database
  repository: PromptsRepository
  users: ChatUserRefs
  audit: ChatAudit
  now?: () => number
}

const DAY_MS = 24 * 60 * 60 * 1000

const iso = (date: Date): string => date.toISOString()

const viewerOf = (ctx: TenantContext, userId: string): PromptViewer => ({
  userId,
  teamIds: ctx.teamIds,
  managesShared: ctx.access.permissions.includes(PERMISSIONS.PROMPTS_MANAGE_SHARED),
})

/** A personal prompt is its owner's to change; a shared one is anyone's who manages shared prompts. */
const canEdit = (prompt: PromptRow, viewer: PromptViewer): boolean =>
  prompt.visibility === 'personal' ? prompt.ownerUserId === viewer.userId : viewer.managesShared

/**
 * What a `PATCH` writes. Switching to `personal` makes the person who switches it its owner; a
 * shared prompt needs `prompts:manage-shared`, and only a shared prompt is limited to teams.
 */
function patchOf(
  current: PromptRow,
  input: UpdatePromptInput,
  viewer: PromptViewer,
): { patch: PromptPatch; visibility: PromptRow['visibility'] } {
  const visibility = input.visibility ?? current.visibility
  if (visibility === 'shared' && !viewer.managesShared) throw new PromptManageForbiddenError()
  if (visibility === 'personal' && (input.teamIds ?? []).length > 0) {
    throw new PromptTeamNotFoundError()
  }
  const patch: PromptPatch = { updatedByUserId: viewer.userId }
  if (input.title !== undefined) patch.title = input.title
  if (input.body !== undefined) {
    patch.body = input.body
    patch.variables = parsePromptVariables(input.body)
  }
  if (input.visibility !== undefined) patch.visibility = input.visibility
  if (visibility === 'personal' && current.visibility === 'shared')
    patch.ownerUserId = viewer.userId
  return { patch, visibility }
}

/**
 * The prompt library (chat.md §9–10): personal and shared prompts with `{variables}`, shared
 * prompts limited to teams, soft delete and restore within 30 days. Every change to a shared
 * prompt is audited; personal prompts are not.
 */
export class PromptsService {
  constructor(private readonly deps: PromptsServiceDeps) {}

  private restorableAfter(): Date {
    return new Date((this.deps.now ?? Date.now)() - PROMPT_RESTORE_WINDOW_DAYS * DAY_MS)
  }

  async list(
    ctx: TenantContext,
    query: ListPromptsQuery,
  ): Promise<{ items: PromptDto[]; nextCursor: string | null }> {
    const viewer = viewerOf(ctx, requireUser(ctx))
    const page = await this.deps.db.tenant(ctx.orgId, async (tx) => {
      const rows = await this.deps.repository.listPage(tx, ctx.orgId, viewer, {
        limit: query.limit,
        query,
        restorableAfter: this.restorableAfter(),
        ...(query.cursor === undefined ? {} : { cursor: decodeCursor(query.cursor) }),
      })
      const result = toPage(rows, query.limit, (row) => ({ k: row.sortKey, id: row.prompt.id }))
      const prompts = result.items.map((row) => row.prompt)
      return {
        prompts,
        teams: await this.deps.repository.teamsOf(
          tx,
          ctx.orgId,
          prompts.map((prompt) => prompt.id),
        ),
        nextCursor: result.nextCursor,
      }
    })
    return {
      items: await this.present(page.prompts, page.teams, viewer),
      nextCursor: page.nextCursor,
    }
  }

  async get(ctx: TenantContext, promptId: string): Promise<PromptDto> {
    const viewer = viewerOf(ctx, requireUser(ctx))
    return this.one(ctx, viewer, (tx) =>
      this.deps.repository.findVisible(tx, ctx.orgId, viewer, promptId),
    )
  }

  async create(ctx: TenantContext, input: CreatePromptInput): Promise<PromptDto> {
    const viewer = viewerOf(ctx, requireUser(ctx))
    if (input.visibility === 'shared' && !viewer.managesShared) {
      throw new PromptManageForbiddenError()
    }
    return this.one(ctx, viewer, async (tx) => {
      await this.assertTeams(tx, ctx.orgId, input.teamIds)
      const prompt = await this.deps.repository.insert(tx, {
        organizationId: ctx.orgId,
        ownerUserId: viewer.userId,
        title: input.title,
        body: input.body,
        variables: parsePromptVariables(input.body),
        visibility: input.visibility,
        createdByUserId: viewer.userId,
        updatedByUserId: viewer.userId,
      })
      if (input.visibility === 'shared') {
        await this.deps.repository.replaceTeams(tx, ctx.orgId, prompt.id, input.teamIds)
        await this.audit(tx, ctx, CHAT_AUDIT_ACTIONS.PROMPT_CREATED, prompt.id, {
          counts: { teams: new Set(input.teamIds).size },
        })
      }
      return prompt
    })
  }

  /**
   * Switching to `personal` removes the teams and makes the person who switches it its owner;
   * switching to `shared` needs `prompts:manage-shared`.
   */
  async update(ctx: TenantContext, promptId: string, input: UpdatePromptInput): Promise<PromptDto> {
    const viewer = viewerOf(ctx, requireUser(ctx))
    const { repository } = this.deps
    return this.one(ctx, viewer, async (tx) => {
      const current = await repository.findVisible(tx, ctx.orgId, viewer, promptId, { lock: true })
      if (current === undefined) throw new PromptNotFoundError()
      if (!canEdit(current, viewer)) throw new PromptManageForbiddenError()
      const { patch, visibility } = patchOf(current, input, viewer)
      const updated = await repository.update(tx, ctx.orgId, promptId, patch)
      if (updated === undefined) throw new PromptNotFoundError()
      if (visibility === 'personal') {
        await repository.replaceTeams(tx, ctx.orgId, promptId, [])
      } else if (input.teamIds !== undefined) {
        await this.assertTeams(tx, ctx.orgId, input.teamIds)
        await repository.replaceTeams(tx, ctx.orgId, promptId, input.teamIds)
      }
      if (current.visibility === 'shared' || visibility === 'shared') {
        await this.audit(tx, ctx, CHAT_AUDIT_ACTIONS.PROMPT_UPDATED, promptId, {
          // field names and the visibility only: a prompt's text is content
          labels: {
            fields: Object.keys(input)
              .sort((a, b) => a.localeCompare(b))
              .join(','),
          },
          ...(current.visibility === visibility
            ? {}
            : { changes: [{ field: 'visibility', from: current.visibility, to: visibility }] }),
        })
      }
      return updated
    })
  }

  /** Moves the prompt to Recently deleted for 30 days. */
  async delete(ctx: TenantContext, promptId: string): Promise<void> {
    const viewer = viewerOf(ctx, requireUser(ctx))
    const { repository } = this.deps
    await this.deps.db.tenant(ctx.orgId, async (tx) => {
      const current = await repository.findVisible(tx, ctx.orgId, viewer, promptId, { lock: true })
      if (current === undefined) throw new PromptNotFoundError()
      if (!canEdit(current, viewer)) throw new PromptManageForbiddenError()
      await repository.update(tx, ctx.orgId, promptId, {
        deletedAt: new Date(),
        deletedByUserId: viewer.userId,
      })
      if (current.visibility === 'shared') {
        await this.audit(tx, ctx, CHAT_AUDIT_ACTIONS.PROMPT_DELETED, promptId)
      }
    })
  }

  /** By its owner, or for a shared prompt without an owner, by Builders and above. */
  async restore(ctx: TenantContext, promptId: string): Promise<PromptDto> {
    const viewer = viewerOf(ctx, requireUser(ctx))
    const { repository } = this.deps
    return this.one(ctx, viewer, async (tx) => {
      const current = await repository.findRestorable(
        tx,
        ctx.orgId,
        viewer,
        promptId,
        this.restorableAfter(),
      )
      if (current === undefined) throw new PromptNotFoundError()
      // a shared prompt comes back only for someone who manages shared prompts
      if (current.visibility === 'shared' && !viewer.managesShared) {
        throw new PromptManageForbiddenError()
      }
      const restored = await repository.update(tx, ctx.orgId, promptId, {
        deletedAt: null,
        deletedByUserId: null,
      })
      if (restored === undefined) throw new PromptNotFoundError()
      if (restored.visibility === 'shared') {
        await this.audit(tx, ctx, CHAT_AUDIT_ACTIONS.PROMPT_RESTORED, promptId)
      }
      return restored
    })
  }

  // ── Private ─────────────────────────────────────────────────────────────────────────────────

  /** Runs `work` in a tenant transaction and presents the prompt it returns, with its teams. */
  private async one(
    ctx: TenantContext,
    viewer: PromptViewer,
    work: (tx: DbExecutor) => Promise<PromptRow | undefined>,
  ): Promise<PromptDto> {
    const found = await this.deps.db.tenant(ctx.orgId, async (tx) => {
      const prompt = await work(tx)
      if (prompt === undefined) throw new PromptNotFoundError()
      return { prompt, teams: await this.deps.repository.teamsOf(tx, ctx.orgId, [prompt.id]) }
    })
    const [dto] = await this.present([found.prompt], found.teams, viewer)
    if (dto === undefined) throw new PromptNotFoundError()
    return dto
  }

  private async assertTeams(tx: DbExecutor, orgId: string, teamIds: readonly string[]) {
    const existing = await this.deps.repository.existingTeams(tx, orgId, teamIds)
    if (teamIds.some((id) => !existing.has(id))) throw new PromptTeamNotFoundError()
  }

  private audit(
    tx: DbExecutor,
    ctx: TenantContext,
    action: string,
    promptId: string,
    metadata?: Parameters<ChatAudit['record']>[2]['metadata'],
  ): Promise<void> {
    return this.deps.audit.record(tx, ctx, {
      action,
      target: { type: 'prompt', id: promptId },
      ...(metadata === undefined ? {} : { metadata }),
    })
  }

  private async present(
    prompts: readonly PromptRow[],
    teams: ReadonlyMap<string, TeamRefDto[]>,
    viewer: PromptViewer,
  ): Promise<PromptDto[]> {
    const refs = await this.deps.users.findUserRefs([
      ...new Set(
        prompts.flatMap((prompt) =>
          [prompt.ownerUserId, prompt.updatedByUserId].filter((id): id is string => id !== null),
        ),
      ),
    ])
    const ref = (id: string | null): UserRefDto | null =>
      id === null ? null : (refs.get(id) ?? null)
    return prompts.map((prompt) => ({
      id: prompt.id,
      title: prompt.title,
      body: prompt.body,
      variables: [...prompt.variables],
      visibility: prompt.visibility,
      teams: prompt.visibility === 'shared' ? [...(teams.get(prompt.id) ?? [])] : [],
      owner: ref(prompt.ownerUserId),
      canEdit: canEdit(prompt, viewer),
      updatedBy: ref(prompt.updatedByUserId),
      deletedAt: prompt.deletedAt === null ? null : iso(prompt.deletedAt),
      purgeAt:
        prompt.deletedAt === null
          ? null
          : iso(new Date(prompt.deletedAt.getTime() + PROMPT_RESTORE_WINDOW_DAYS * DAY_MS)),
      createdAt: iso(prompt.createdAt),
      updatedAt: iso(prompt.updatedAt),
    }))
  }
}
