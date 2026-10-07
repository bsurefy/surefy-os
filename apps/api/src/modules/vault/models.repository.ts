// SPDX-License-Identifier: AGPL-3.0-only
import { and, eq, exists, ilike, inArray, isNull, notInArray, or, sql, type SQL } from 'drizzle-orm'

import {
  modelAccessRules,
  vaultCredentials,
  vaultModels,
  vaultSettings,
} from '@/database/tables/index.js'
import {
  keysetAfter,
  keysetKey,
  keysetOrder,
  parseSort,
  type KeysetCursor,
  type KeysetSort,
} from '@/lib/pagination.js'
import type {
  ListModelAccessQuery,
  ListVaultModelsQuery,
  ModelAccessSubjectInput,
  ModelType,
  VaultFallback,
} from '@surefy/contracts'

import type { DbExecutor } from '@/core/database/index.js'

export type VaultModelRow = typeof vaultModels.$inferSelect
export type NewVaultModelRow = typeof vaultModels.$inferInsert
export type ModelAccessRuleRow = typeof modelAccessRules.$inferSelect
export type VaultSettingsRow = typeof vaultSettings.$inferSelect

const vm = vaultModels
const rules = modelAccessRules

const likeTerm = (q: string): string => `%${q.replaceAll(/[\\%_]/g, (c) => '\\' + c)}%`

export const modelSort = (sort: string | undefined): KeysetSort => {
  const { field, descending } = parseSort<'displayName' | 'createdAt'>(sort, 'displayName')
  return field === 'displayName'
    ? { expression: sql`lower(${vm.displayName})`, cast: 'text', descending }
    : { expression: vm.createdAt, cast: 'timestamptz', descending }
}

/** A model as a sync found it, with its catalog metadata. */
export type DiscoveredModelRow = Omit<
  NewVaultModelRow,
  'id' | 'organizationId' | 'isEnabled' | 'status' | 'createdAt' | 'updatedAt'
> & { startsEnabled: boolean }

/** Who a person is for model access: themselves and their teams. */
export interface ModelSubject {
  userId: string | null
  teamIds: readonly string[]
}

/** Provider models only of the allowed providers; local and trained models are not providers. */
function providerRule(providersAllowed: readonly string[] | null): SQL | undefined {
  if (providersAllowed === null) return undefined
  if (providersAllowed.length === 0) return sql`${vm.source} <> 'provider'`
  return or(sql`${vm.source} <> 'provider'`, inArray(vm.providerKey, [...providersAllowed]))
}

/** `vault_models`, `model_access_rules` and `vault_settings`. */
export class ModelsRepository {
  findById(tx: DbExecutor, orgId: string, id: string) {
    return tx.query.vaultModels.findFirst({
      where: and(eq(vm.organizationId, orgId), eq(vm.id, id)),
    })
  }

  findByKey(tx: DbExecutor, orgId: string, modelKey: string) {
    return tx.query.vaultModels.findFirst({
      where: and(eq(vm.organizationId, orgId), eq(vm.modelKey, modelKey)),
    })
  }

  findByKeys(tx: DbExecutor, orgId: string, modelKeys: readonly string[]) {
    if (modelKeys.length === 0) return Promise.resolve([])
    return tx
      .select()
      .from(vm)
      .where(and(eq(vm.organizationId, orgId), inArray(vm.modelKey, [...modelKeys])))
  }

  /** Server names of local models, by credential id. */
  async serverNames(tx: DbExecutor, orgId: string, ids: readonly string[]) {
    if (ids.length === 0) return new Map<string, string>()
    const rows = await tx
      .select({ id: vaultCredentials.id, name: vaultCredentials.name })
      .from(vaultCredentials)
      .where(
        and(eq(vaultCredentials.organizationId, orgId), inArray(vaultCredentials.id, [...ids])),
      )
    return new Map(rows.map((r) => [r.id, r.name]))
  }

  listPage(
    tx: DbExecutor,
    orgId: string,
    page: {
      limit: number
      sort: KeysetSort
      cursor?: KeysetCursor
      filters: Omit<ListVaultModelsQuery, 'limit' | 'cursor' | 'sort'> &
        Partial<Pick<ListModelAccessQuery, 'type'>>
    },
  ) {
    const { filters } = page
    const conditions: (SQL | undefined)[] = [
      eq(vm.organizationId, orgId),
      filters.q === undefined
        ? undefined
        : or(ilike(vm.displayName, likeTerm(filters.q)), ilike(vm.modelKey, likeTerm(filters.q))),
      filters.type === undefined ? undefined : inArray(vm.type, filters.type),
      filters.source === undefined ? undefined : inArray(vm.source, filters.source),
      filters.status === undefined ? undefined : inArray(vm.status, filters.status),
      filters.providerKey === undefined ? undefined : eq(vm.providerKey, filters.providerKey),
      filters.serverId === undefined ? undefined : eq(vm.credentialId, filters.serverId),
      filters.isEnabled === undefined ? undefined : eq(vm.isEnabled, filters.isEnabled),
      keysetAfter(page.sort, vm.id, page.cursor),
    ]
    return tx
      .select({ model: vm, sortKey: keysetKey(page.sort) })
      .from(vm)
      .where(and(...conditions))
      .orderBy(...keysetOrder(page.sort, vm.id))
      .limit(page.limit + 1)
  }

  /**
   * Upserts what a sync found on (organization, model key). New models start enabled only when
   * the catalog knows them and they are not local; existing ones keep their switch.
   */
  async upsertDiscovered(
    tx: DbExecutor,
    orgId: string,
    models: readonly (DiscoveredModelRow & { modelKey: string })[],
  ): Promise<{ inserted: VaultModelRow[] }> {
    const insertedIds: string[] = []
    for (const { startsEnabled, ...model } of models) {
      const [row] = await tx
        .insert(vm)
        .values({
          ...model,
          organizationId: orgId,
          isEnabled: startsEnabled,
          lastSeenAt: sql`current_timestamp`,
        })
        .onConflictDoUpdate({
          target: [vm.organizationId, vm.modelKey],
          set: {
            displayName: model.displayName,
            type: model.type,
            supportsVision: model.supportsVision,
            supportsTools: model.supportsTools,
            contextWindow: model.contextWindow,
            embeddingDimensions: model.embeddingDimensions,
            inputPricePerMtokMicros: model.inputPricePerMtokMicros,
            outputPricePerMtokMicros: model.outputPricePerMtokMicros,
            cachedInputPricePerMtokMicros: model.cachedInputPricePerMtokMicros,
            currency: model.currency,
            status: 'available',
            lastSeenAt: sql`current_timestamp`,
          },
        })
        .returning({ id: vm.id, isNew: sql<boolean>`(xmax = 0)` })
      if (row?.isNew) insertedIds.push(row.id)
    }
    const inserted =
      insertedIds.length === 0
        ? []
        : await tx
            .select()
            .from(vm)
            .where(and(eq(vm.organizationId, orgId), inArray(vm.id, insertedIds)))
    return { inserted }
  }

  /** Models of a provider or a server that a sync no longer lists. */
  async markRemovedUpstream(
    tx: DbExecutor,
    orgId: string,
    scope: { providerKey: string; credentialId: string | null },
    seenModelKeys: readonly string[],
  ): Promise<number> {
    const rows = await tx
      .update(vm)
      .set({ status: 'removed_upstream' })
      .where(
        and(
          eq(vm.organizationId, orgId),
          eq(vm.providerKey, scope.providerKey),
          scope.credentialId === null
            ? isNull(vm.credentialId)
            : eq(vm.credentialId, scope.credentialId),
          seenModelKeys.length === 0 ? undefined : notInArray(vm.modelKey, [...seenModelKeys]),
          sql`${vm.status} <> 'removed_upstream'`,
        ),
      )
      .returning({ id: vm.id })
    return rows.length
  }

  /** Provider models of a provider with no usable key left, or every model of an offline server. */
  async setAvailability(
    tx: DbExecutor,
    orgId: string,
    scope: { providerKey: string; credentialId: string | null },
    available: boolean,
  ): Promise<void> {
    await tx
      .update(vm)
      .set({ status: available ? 'available' : 'unavailable' })
      .where(
        and(
          eq(vm.organizationId, orgId),
          eq(vm.providerKey, scope.providerKey),
          scope.credentialId === null
            ? isNull(vm.credentialId)
            : eq(vm.credentialId, scope.credentialId),
          sql`${vm.status} <> 'removed_upstream'`,
        ),
      )
  }

  async setEnabled(tx: DbExecutor, orgId: string, id: string, isEnabled: boolean) {
    const [row] = await tx
      .update(vm)
      .set({ isEnabled })
      .where(and(eq(vm.organizationId, orgId), eq(vm.id, id)))
      .returning()
    return row
  }

  // ── Access rules ──────────────────────────────────────────────────────────────────────────────

  rulesOf(tx: DbExecutor, orgId: string, modelIds: readonly string[]) {
    if (modelIds.length === 0) return Promise.resolve([])
    return tx
      .select()
      .from(rules)
      .where(and(eq(rules.organizationId, orgId), inArray(rules.vaultModelId, [...modelIds])))
      .orderBy(rules.createdAt, rules.id)
  }

  /** Replaces a model's rules; returns whether anything changed. */
  async replaceRules(
    tx: DbExecutor,
    orgId: string,
    modelId: string,
    subjects: readonly ModelAccessSubjectInput[],
    userId: string | null,
  ): Promise<boolean> {
    const deleted = await tx
      .delete(rules)
      .where(and(eq(rules.organizationId, orgId), eq(rules.vaultModelId, modelId)))
      .returning({ id: rules.id })
    if (subjects.length > 0) {
      await tx
        .insert(rules)
        .values(
          subjects.map((subject) => ({
            organizationId: orgId,
            vaultModelId: modelId,
            subjectType: subject.subjectType,
            teamId: subject.subjectType === 'team' ? subject.teamId : null,
            userId: subject.subjectType === 'user' ? subject.userId : null,
            createdByUserId: userId,
          })),
        )
        .onConflictDoNothing()
    }
    return deleted.length > 0 || subjects.length > 0
  }

  async hasRules(tx: DbExecutor, orgId: string, modelId: string): Promise<boolean> {
    const [row] = await tx
      .select({ id: rules.id })
      .from(rules)
      .where(and(eq(rules.organizationId, orgId), eq(rules.vaultModelId, modelId)))
      .limit(1)
    return row !== undefined
  }

  /**
   * Models a person (or a team) may use: enabled, available, granted by a rule for the
   * organization, one of the teams, or the person; then the provider rules of the access chain.
   */
  allowedModels(
    tx: DbExecutor,
    orgId: string,
    subject: ModelSubject,
    filters: {
      providersAllowed: readonly string[] | null
      localModels: boolean
      type?: ModelType
      modelIds?: readonly string[]
    },
  ) {
    const granted = exists(
      tx
        .select({ one: sql`1` })
        .from(rules)
        .where(
          and(
            eq(rules.organizationId, vm.organizationId),
            eq(rules.vaultModelId, vm.id),
            or(
              eq(rules.subjectType, 'organization'),
              subject.teamIds.length === 0
                ? undefined
                : inArray(rules.teamId, [...subject.teamIds]),
              subject.userId === null ? undefined : eq(rules.userId, subject.userId),
            ),
          ),
        ),
    )
    const providerFilter = providerRule(filters.providersAllowed)
    return tx
      .select()
      .from(vm)
      .where(
        and(
          eq(vm.organizationId, orgId),
          eq(vm.isEnabled, true),
          eq(vm.status, 'available'),
          granted,
          providerFilter,
          filters.localModels ? undefined : sql`${vm.source} <> 'local'`,
          filters.type === undefined ? undefined : eq(vm.type, filters.type),
          filters.modelIds === undefined ? undefined : inArray(vm.id, [...filters.modelIds]),
        ),
      )
      .orderBy(sql`lower(${vm.displayName})`, vm.id)
  }

  // ── Settings ──────────────────────────────────────────────────────────────────────────────────

  /** Inserted with the organization (and backfilled for older ones), so a read never upserts. */
  async settings(tx: DbExecutor, orgId: string): Promise<VaultSettingsRow> {
    const [row] = await tx
      .select()
      .from(vaultSettings)
      .where(eq(vaultSettings.organizationId, orgId))
    if (row === undefined) throw new Error(`organization ${orgId} has no vault_settings row`)
    return row
  }

  async updateSettings(
    tx: DbExecutor,
    orgId: string,
    patch: {
      embeddingVaultModelId?: string | null
      fallback?: VaultFallback
      updatedByUserId: string | null
    },
  ): Promise<VaultSettingsRow> {
    const [row] = await tx
      .update(vaultSettings)
      .set(patch)
      .where(eq(vaultSettings.organizationId, orgId))
      .returning()
    if (row === undefined) throw new Error('vault_settings update returned no row')
    return row
  }
}
