// SPDX-License-Identifier: AGPL-3.0-only
import { sqlState } from '@/core/database/index.js'
import { decodeCursor, toPage } from '@/lib/pagination.js'
import { VAULT_AUDIT_ACTIONS } from '@surefy/contracts'
import type {
  FallbackEntryDto,
  ListModelAccessQuery,
  ListUsableModelsQuery,
  ListVaultModelsQuery,
  ModelAccessEntryDto,
  ModelAccessRuleDto,
  ModelCostTier,
  ModelImpactDto,
  ModelType,
  SetModelAccessInput,
  UpdateVaultModelInput,
  UpdateVaultSettingsInput,
  UsableModelDto,
  VaultFallback,
  VaultModelDto,
  VaultModelSource,
  VaultSettingsDto,
} from '@surefy/contracts'

import { modelSort, type ModelsRepository, type VaultModelRow } from './models.repository.js'
import {
  ModelEmbeddingInvalidError,
  ModelNotFoundError,
  VaultMemberNotFoundError,
  VaultTeamNotFoundError,
} from './vault.errors.js'
import { toRuleDto, toVaultModelDto } from './vault.mapper.js'

import type { VaultContext, VaultOrganizations, VaultTeams, VaultUserRefs } from './vault.types.js'
import type { Database, DbExecutor } from '@/core/database/index.js'
import type { AccessModels } from '@/modules/access/index.js'
import type { AuditRecorder } from '@/modules/audit/index.js'

export interface ModelsServiceDeps {
  db: Database
  modelsRepository: ModelsRepository
  organizations: VaultOrganizations
  teams: VaultTeams
  users: VaultUserRefs
  audit: AuditRecorder
}

const FOREIGN_KEY_VIOLATION = '23503'

/** Input prices per million tokens (micros) that separate the picker's cost tiers. */
const COST_TIER_BOUNDS = { low: 1_000_000, medium: 5_000_000 } as const

function costTierOf(row: VaultModelRow): ModelCostTier {
  if (row.source !== 'provider') return 'free'
  const price = row.inputPricePerMtokMicros
  if (price === null) return 'unknown'
  if (price < COST_TIER_BOUNDS.low) return 'low'
  if (price < COST_TIER_BOUNDS.medium) return 'medium'
  return 'high'
}

function toUsableDto(row: VaultModelRow): UsableModelDto {
  return {
    modelKey: row.modelKey,
    displayName: row.displayName,
    providerKey: row.providerKey,
    type: row.type as ModelType,
    source: row.source as VaultModelSource,
    dataLocation: row.source === 'provider' ? 'sent_to_provider' : 'on_server',
    costTier: costTierOf(row),
    supportsVision: row.supportsVision,
    supportsTools: row.supportsTools,
    contextWindow: row.contextWindow,
  }
}

/** What the fallback order resolves to now, for the settings tab and the impact dialogs. */
export interface ResolvedFallback {
  order: string[]
  entries: FallbackEntryDto[]
  /** The first entry the gateway would use. */
  first: { modelKey: string; displayName: string } | null
}

/**
 * The models an organization can call, who may use each, and the embedding model and fallback
 * order (vault-and-models.md, §3–5). Every change to who may use a model bumps the organization's
 * access version in the same transaction, so effective access is recomputed.
 */
export class ModelsService implements AccessModels {
  constructor(private readonly deps: ModelsServiceDeps) {}

  // ── The access module's port: `allowedModelIds` ───────────────────────────────────────────────

  async allowedFor(
    tx: DbExecutor,
    input: {
      orgId: string
      userId: string | null
      teamIds: readonly string[]
      providersAllowed: readonly string[] | null
      localModels: boolean
    },
  ): Promise<string[]> {
    const rows = await this.deps.modelsRepository.allowedModels(
      tx,
      input.orgId,
      { userId: input.userId, teamIds: input.teamIds },
      { providersAllowed: input.providersAllowed, localModels: input.localModels },
    )
    return rows.map((row) => row.id)
  }

  // ── The picker ────────────────────────────────────────────────────────────────────────────────

  /** `GET …/models`: the models the caller may use, from their effective access. */
  async listUsable(
    ctx: VaultContext,
    allowedModelIds: readonly string[] | 'all',
    query: ListUsableModelsQuery,
  ): Promise<{ items: UsableModelDto[]; nextCursor: string | null }> {
    const wantsVault = query.source === undefined || query.source.some((s) => s !== 'platform')
    if (!wantsVault || (allowedModelIds !== 'all' && allowedModelIds.length === 0)) {
      return { items: [], nextCursor: null }
    }
    const sort = modelSort('displayName')
    return this.deps.db.tenant(ctx.orgId, async (tx) => {
      const rows = await this.deps.modelsRepository.listPage(tx, ctx.orgId, {
        limit: query.limit,
        sort,
        filters: {
          ...(query.q === undefined ? {} : { q: query.q }),
          ...(query.type === undefined ? {} : { type: [query.type] }),
          ...(query.source === undefined
            ? {}
            : { source: query.source.filter((s): s is VaultModelSource => s !== 'platform') }),
          status: ['available'],
          isEnabled: true,
        },
        ...(query.cursor === undefined ? {} : { cursor: decodeCursor(query.cursor) }),
      })
      const page = toPage(rows, query.limit, (row) => ({ k: row.sortKey, id: row.model.id }))
      const allowed = allowedModelIds === 'all' ? null : new Set(allowedModelIds)
      return {
        items: page.items
          .map((row) => row.model)
          .filter((row) => allowed === null || allowed.has(row.id))
          .map(toUsableDto),
        nextCursor: page.nextCursor,
      }
    })
  }

  // ── Vault › models ────────────────────────────────────────────────────────────────────────────

  async listModels(
    ctx: VaultContext,
    query: ListVaultModelsQuery,
  ): Promise<{ items: VaultModelDto[]; nextCursor: string | null }> {
    const { limit, cursor, sort, ...filters } = query
    return this.deps.db.tenant(ctx.orgId, async (tx) => {
      const rows = await this.deps.modelsRepository.listPage(tx, ctx.orgId, {
        limit,
        sort: modelSort(sort),
        filters,
        ...(cursor === undefined ? {} : { cursor: decodeCursor(cursor) }),
      })
      const page = toPage(rows, limit, (row) => ({ k: row.sortKey, id: row.model.id }))
      return {
        items: await this.toDtos(
          tx,
          ctx.orgId,
          page.items.map((row) => row.model),
        ),
        nextCursor: page.nextCursor,
      }
    })
  }

  async getModel(ctx: VaultContext, id: string): Promise<VaultModelDto> {
    return this.deps.db.tenant(ctx.orgId, async (tx) => {
      const [dto] = await this.toDtos(tx, ctx.orgId, [await this.findOrThrow(tx, ctx.orgId, id)])
      if (dto === undefined) throw new ModelNotFoundError()
      return dto
    })
  }

  /**
   * `PATCH …/vault/models/:modelId`: the enable switch, and optionally who may use it. Enabling a
   * model with no rule offers it to the whole organization unless `access` says otherwise.
   */
  async updateModel(
    ctx: VaultContext,
    id: string,
    input: UpdateVaultModelInput,
  ): Promise<VaultModelDto> {
    return this.deps.db.tenant(ctx.orgId, async (tx) => {
      const before = await this.findOrThrow(tx, ctx.orgId, id)
      let row = before
      let accessChanged = false
      if (input.isEnabled !== undefined && input.isEnabled !== before.isEnabled) {
        row =
          (await this.deps.modelsRepository.setEnabled(tx, ctx.orgId, id, input.isEnabled)) ??
          before
        accessChanged = true
        await this.deps.audit.record(tx, ctx, {
          action: input.isEnabled
            ? VAULT_AUDIT_ACTIONS.VAULT_MODEL_ENABLED
            : VAULT_AUDIT_ACTIONS.VAULT_MODEL_DISABLED,
          target: { type: 'vault_model', id },
          metadata: { labels: { modelKey: before.modelKey } },
        })
        if (
          input.isEnabled &&
          input.access === undefined &&
          !(await this.deps.modelsRepository.hasRules(tx, ctx.orgId, id))
        ) {
          await this.deps.modelsRepository.replaceRules(
            tx,
            ctx.orgId,
            id,
            [{ subjectType: 'organization' }],
            ctx.userId,
          )
        }
      }
      if (input.access !== undefined) {
        await this.replaceAccess(tx, ctx, row, input.access)
        accessChanged = true
      }
      if (accessChanged) await this.deps.organizations.bumpAccessVersionInTx(tx, ctx.orgId)
      const [dto] = await this.toDtos(tx, ctx.orgId, [row])
      if (dto === undefined) throw new ModelNotFoundError()
      return dto
    })
  }

  async impact(ctx: VaultContext, id: string): Promise<ModelImpactDto> {
    return this.deps.db.tenant(ctx.orgId, async (tx) => {
      await this.findOrThrow(tx, ctx.orgId, id)
      const fallback = await this.fallbackFor(tx, ctx.orgId)
      return { dependents: [], listed: [], userCount: 0, fallback: fallback.first }
    })
  }

  // ── Model access ──────────────────────────────────────────────────────────────────────────────

  async listAccess(
    ctx: VaultContext,
    query: ListModelAccessQuery,
  ): Promise<{ items: ModelAccessEntryDto[]; nextCursor: string | null }> {
    const { limit, cursor, ...filters } = query
    return this.deps.db.tenant(ctx.orgId, async (tx) => {
      const rows = await this.deps.modelsRepository.listPage(tx, ctx.orgId, {
        limit,
        sort: modelSort('displayName'),
        filters,
        ...(cursor === undefined ? {} : { cursor: decodeCursor(cursor) }),
      })
      const page = toPage(rows, limit, (row) => ({ k: row.sortKey, id: row.model.id }))
      const models = page.items.map((row) => row.model)
      const rules = await this.rulesByModel(
        tx,
        ctx.orgId,
        models.map((m) => m.id),
      )
      return {
        items: models.map((model) => ({
          modelId: model.id,
          modelKey: model.modelKey,
          displayName: model.displayName,
          providerKey: model.providerKey,
          type: model.type as ModelType,
          isEnabled: model.isEnabled,
          rules: rules.get(model.id) ?? [],
        })),
        nextCursor: page.nextCursor,
      }
    })
  }

  async getAccess(ctx: VaultContext, id: string): Promise<ModelAccessRuleDto[]> {
    return this.deps.db.tenant(ctx.orgId, async (tx) => {
      await this.findOrThrow(tx, ctx.orgId, id)
      return (await this.rulesByModel(tx, ctx.orgId, [id])).get(id) ?? []
    })
  }

  /** `PUT …/vault/models/:modelId/access`: replaces the rules; an empty list allows nobody. */
  async setAccess(
    ctx: VaultContext,
    id: string,
    input: SetModelAccessInput,
  ): Promise<ModelAccessRuleDto[]> {
    return this.deps.db.tenant(ctx.orgId, async (tx) => {
      const model = await this.findOrThrow(tx, ctx.orgId, id)
      await this.replaceAccess(tx, ctx, model, input)
      await this.deps.organizations.bumpAccessVersionInTx(tx, ctx.orgId)
      return (await this.rulesByModel(tx, ctx.orgId, [id])).get(id) ?? []
    })
  }

  // ── Settings ──────────────────────────────────────────────────────────────────────────────────

  async getSettings(ctx: VaultContext): Promise<VaultSettingsDto> {
    return this.deps.db.tenant(ctx.orgId, (tx) => this.settingsDto(tx, ctx.orgId))
  }

  async updateSettings(
    ctx: VaultContext,
    input: UpdateVaultSettingsInput,
  ): Promise<VaultSettingsDto> {
    return this.deps.db.tenant(ctx.orgId, async (tx) => {
      const before = await this.deps.modelsRepository.settings(tx, ctx.orgId)
      if (input.embeddingModelId !== undefined && input.embeddingModelId !== null) {
        const model = await this.deps.modelsRepository.findById(
          tx,
          ctx.orgId,
          input.embeddingModelId,
        )
        if (model?.type !== 'embedding' || !model.isEnabled) throw new ModelEmbeddingInvalidError()
      }
      const after = await this.deps.modelsRepository.updateSettings(tx, ctx.orgId, {
        ...(input.embeddingModelId === undefined
          ? {}
          : { embeddingVaultModelId: input.embeddingModelId }),
        ...(input.fallback === undefined ? {} : { fallback: input.fallback }),
        updatedByUserId: ctx.userId,
      })
      const changes = [
        ...(before.embeddingVaultModelId === after.embeddingVaultModelId
          ? []
          : [
              {
                field: 'embeddingModelId',
                from: before.embeddingVaultModelId,
                to: after.embeddingVaultModelId,
              },
            ]),
        ...(JSON.stringify(before.fallback) === JSON.stringify(after.fallback)
          ? []
          : [{ field: 'fallback', from: before.fallback, to: after.fallback }]),
      ]
      if (changes.length > 0) {
        await this.deps.audit.record(tx, ctx, {
          action: VAULT_AUDIT_ACTIONS.VAULT_SETTINGS_UPDATED,
          target: { type: 'vault_settings', id: null },
          metadata: { changes },
        })
      }
      return this.settingsDto(tx, ctx.orgId)
    })
  }

  /** The fallback order resolved against the current models. */
  async fallbackFor(tx: DbExecutor, orgId: string): Promise<ResolvedFallback> {
    const settings = await this.deps.modelsRepository.settings(tx, orgId)
    return this.resolveFallback(tx, orgId, settings.fallback)
  }

  // ── Internals ─────────────────────────────────────────────────────────────────────────────────

  private async resolveFallback(
    tx: DbExecutor,
    orgId: string,
    fallback: VaultFallback,
  ): Promise<ResolvedFallback> {
    const models = new Map(
      (await this.deps.modelsRepository.findByKeys(tx, orgId, fallback.order)).map((m) => [
        m.modelKey,
        m,
      ]),
    )
    const entries: FallbackEntryDto[] = fallback.order.map((modelKey) => {
      const model = models.get(modelKey)
      if (model === undefined) return { modelKey, displayName: null, state: 'missing' }
      if (!model.isEnabled) return { modelKey, displayName: model.displayName, state: 'disabled' }
      if (model.status !== 'available')
        return { modelKey, displayName: model.displayName, state: 'unavailable' }
      return { modelKey, displayName: model.displayName, state: 'ready' }
    })
    const ready = entries.find((entry) => entry.state === 'ready')
    return {
      order: fallback.order,
      entries,
      first: ready?.displayName
        ? { modelKey: ready.modelKey, displayName: ready.displayName }
        : null,
    }
  }

  private async settingsDto(tx: DbExecutor, orgId: string): Promise<VaultSettingsDto> {
    const settings = await this.deps.modelsRepository.settings(tx, orgId)
    const embedding =
      settings.embeddingVaultModelId === null
        ? undefined
        : await this.deps.modelsRepository.findById(tx, orgId, settings.embeddingVaultModelId)
    const resolved = await this.resolveFallback(tx, orgId, settings.fallback)
    return {
      embeddingModel:
        embedding === undefined
          ? null
          : {
              id: embedding.id,
              modelKey: embedding.modelKey,
              displayName: embedding.displayName,
              dimensions: embedding.embeddingDimensions,
            },
      fallback: settings.fallback,
      fallbackEntries: resolved.entries,
      updatedByUserId: settings.updatedByUserId,
      updatedAt: settings.updatedAt.toISOString(),
    }
  }

  private async replaceAccess(
    tx: DbExecutor,
    ctx: VaultContext,
    model: VaultModelRow,
    input: SetModelAccessInput,
  ): Promise<void> {
    const teamIds = [
      ...new Set(input.rules.flatMap((r) => (r.subjectType === 'team' ? [r.teamId] : []))),
    ]
    const teams = await this.deps.teams.findRefsInTx(tx, ctx.orgId, teamIds)
    if (teams.length !== teamIds.length) throw new VaultTeamNotFoundError()
    await this.deps.modelsRepository
      .replaceRules(tx, ctx.orgId, model.id, input.rules, ctx.userId)
      .catch((error: unknown) => {
        // the composite FK to organization_members: a person who is not a member here
        if (sqlState(error) === FOREIGN_KEY_VIOLATION) throw new VaultMemberNotFoundError()
        throw error
      })
    await this.deps.audit.record(tx, ctx, {
      action: VAULT_AUDIT_ACTIONS.VAULT_MODEL_ACCESS_CHANGED,
      target: { type: 'vault_model', id: model.id },
      metadata: {
        labels: { modelKey: model.modelKey },
        counts: {
          organization: input.rules.filter((r) => r.subjectType === 'organization').length,
          teams: input.rules.filter((r) => r.subjectType === 'team').length,
          people: input.rules.filter((r) => r.subjectType === 'user').length,
        },
      },
    })
  }

  private async rulesByModel(tx: DbExecutor, orgId: string, modelIds: readonly string[]) {
    const rows = await this.deps.modelsRepository.rulesOf(tx, orgId, modelIds)
    const teamIds = [...new Set(rows.flatMap((r) => (r.teamId === null ? [] : [r.teamId])))]
    const userIds = [...new Set(rows.flatMap((r) => (r.userId === null ? [] : [r.userId])))]
    const teams = new Map(
      (await this.deps.teams.findRefsInTx(tx, orgId, teamIds)).map((t) => [t.id, t]),
    )
    const users = await this.deps.users.findUserRefs(userIds)
    const byModel = new Map<string, ModelAccessRuleDto[]>()
    for (const row of rows) {
      const list = byModel.get(row.vaultModelId) ?? []
      list.push(toRuleDto(row, teams, users))
      byModel.set(row.vaultModelId, list)
    }
    return byModel
  }

  private async findOrThrow(tx: DbExecutor, orgId: string, id: string): Promise<VaultModelRow> {
    const row = await this.deps.modelsRepository.findById(tx, orgId, id)
    if (row === undefined) throw new ModelNotFoundError()
    return row
  }

  private async toDtos(
    tx: DbExecutor,
    orgId: string,
    rows: readonly VaultModelRow[],
  ): Promise<VaultModelDto[]> {
    const serverIds = [
      ...new Set(rows.flatMap((r) => (r.credentialId === null ? [] : [r.credentialId]))),
    ]
    const names = await this.deps.modelsRepository.serverNames(tx, orgId, serverIds)
    return rows.map((row) =>
      toVaultModelDto(
        row,
        row.credentialId === null ? null : (names.get(row.credentialId) ?? null),
      ),
    )
  }
}
