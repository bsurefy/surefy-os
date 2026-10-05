// SPDX-License-Identifier: AGPL-3.0-only
import { and, count, eq, inArray, ne, sql } from 'drizzle-orm'

import { vaultCredentials, vaultModels, vaultSettings } from '@/database/tables/index.js'
import { catalogEntry, type DiscoveredModel } from '@/integrations/ai/index.js'
import { localModelKey, providerModelKey } from '@surefy/contracts'
import type { DetectedModelDto } from '@surefy/contracts'

import type { DiscoveredModelRow, ModelsRepository } from './models.repository.js'
import type { CredentialRow } from './vault.repository.js'
import type { VaultContext, VaultOrganizations } from './vault.types.js'
import type { DbExecutor } from '@/core/database/index.js'

const DETECTED_MAX = 1000

/** A discovered model with its catalog metadata, ready to upsert. */
function toRow(
  providerKey: string,
  model: DiscoveredModel,
  extra: { modelKey: string; source: 'provider' | 'local'; credentialId: string | null },
): DiscoveredModelRow & { modelKey: string } {
  const entry = catalogEntry(providerKey, model.providerModelId)
  const type = entry?.type ?? model.type
  return {
    modelKey: extra.modelKey,
    credentialId: extra.credentialId,
    providerKey,
    providerModelId: model.providerModelId,
    displayName: entry?.displayName ?? model.displayName,
    type,
    source: extra.source,
    supportsVision: entry?.supportsVision ?? false,
    supportsTools: entry?.supportsTools ?? false,
    contextWindow: entry?.contextWindow ?? null,
    // null for an embedding model of unknown size: `storable()` leaves it out
    embeddingDimensions: type === 'embedding' ? (entry?.embeddingDimensions ?? null) : null,
    inputPricePerMtokMicros: entry?.prices.inputPerMTokMicros ?? null,
    outputPricePerMtokMicros: entry?.prices.outputPerMTokMicros ?? null,
    cachedInputPricePerMtokMicros: entry?.prices.cachedInputPerMTokMicros ?? null,
    currency: entry?.prices.currency ?? 'USD',
    // provider models in the catalog start enabled; the rest, and every local model, start disabled
    startsEnabled: extra.source === 'provider' && entry !== undefined,
  }
}

/**
 * Model discovery (vault-and-models.md, §3): after a passing test or a sync, the listed models are
 * upserted with their catalog metadata, and the ones no longer listed are marked
 * `removed_upstream`. Embedding models whose size SurefyOS does not know are skipped: no index can
 * hold them.
 */
export class ModelSync {
  constructor(
    private readonly repository: ModelsRepository,
    private readonly organizations: VaultOrganizations,
  ) {}

  detected(providerKey: string, models: readonly DiscoveredModel[]): DetectedModelDto[] {
    return models.slice(0, DETECTED_MAX).map((model) => {
      const entry = catalogEntry(providerKey, model.providerModelId)
      return {
        providerModelId: model.providerModelId,
        displayName: entry?.displayName ?? model.displayName,
        type: entry?.type ?? model.type,
        inCatalog: entry !== undefined,
      }
    })
  }

  /** Provider models belong to the provider, not to a key (`credential_id` null). */
  async storeProviderModels(
    tx: DbExecutor,
    ctx: VaultContext,
    providerKey: string,
    models: readonly DiscoveredModel[],
  ): Promise<void> {
    const rows = storable(
      models.map((model) =>
        toRow(providerKey, model, {
          modelKey: providerModelKey(providerKey, model.providerModelId),
          source: 'provider',
          credentialId: null,
        }),
      ),
    )
    const { inserted } = await this.repository.upsertDiscovered(tx, ctx.orgId, rows)
    await this.repository.markRemovedUpstream(
      tx,
      ctx.orgId,
      { providerKey, credentialId: null },
      rows.map((row) => row.modelKey),
    )
    await this.repository.setAvailability(tx, ctx.orgId, { providerKey, credentialId: null }, true)
    // a model enabled for the first time is offered to the whole organization
    const enabled = inserted.filter((row) => row.isEnabled)
    for (const row of enabled) {
      await this.repository.replaceRules(
        tx,
        ctx.orgId,
        row.id,
        [{ subjectType: 'organization' }],
        ctx.userId,
      )
    }
    if (enabled.length > 0) await this.organizations.bumpAccessVersionInTx(tx, ctx.orgId)
  }

  /** A local server's models, all disabled until an Admin enables them. */
  async storeServerModels(
    tx: DbExecutor,
    orgId: string,
    server: CredentialRow,
    models: readonly DiscoveredModel[],
  ): Promise<{ added: number; removed: number }> {
    const rows = storable(
      models.map((model) =>
        toRow(server.providerKey, model, {
          modelKey: localModelKey(server.id, model.providerModelId),
          source: 'local',
          credentialId: server.id,
        }),
      ),
    )
    const { inserted } = await this.repository.upsertDiscovered(tx, orgId, rows)
    const removed = await this.repository.markRemovedUpstream(
      tx,
      orgId,
      { providerKey: server.providerKey, credentialId: server.id },
      rows.map((row) => row.modelKey),
    )
    await this.setServerAvailability(tx, orgId, server, true)
    return { added: inserted.length, removed }
  }

  async setServerAvailability(
    tx: DbExecutor,
    orgId: string,
    server: CredentialRow,
    available: boolean,
  ): Promise<void> {
    await this.repository.setAvailability(
      tx,
      orgId,
      { providerKey: server.providerKey, credentialId: server.id },
      available,
    )
  }

  /** After a revoke: a provider with no organization or team key left has unavailable models. */
  async refreshProviderAvailability(
    tx: DbExecutor,
    orgId: string,
    providerKey: string,
  ): Promise<void> {
    const [row] = await tx
      .select({ n: count() })
      .from(vaultCredentials)
      .where(
        and(
          eq(vaultCredentials.organizationId, orgId),
          eq(vaultCredentials.kind, 'ai_provider'),
          eq(vaultCredentials.providerKey, providerKey),
          ne(vaultCredentials.scope, 'personal'),
          ne(vaultCredentials.status, 'revoked'),
        ),
      )
    await this.repository.setAvailability(
      tx,
      orgId,
      { providerKey, credentialId: null },
      (row?.n ?? 0) > 0,
    )
  }

  /** Models per provider key (not removed upstream), for the provider cards. */
  async countByProvider(tx: DbExecutor, orgId: string): Promise<ReadonlyMap<string, number>> {
    const rows = await tx
      .select({ providerKey: vaultModels.providerKey, n: count() })
      .from(vaultModels)
      .where(and(eq(vaultModels.organizationId, orgId), ne(vaultModels.status, 'removed_upstream')))
      .groupBy(vaultModels.providerKey)
    return new Map(rows.map((row) => [row.providerKey, row.n]))
  }

  /** Whether one of the server's models is the embedding model (removal is refused). */
  async isEmbeddingServer(tx: DbExecutor, orgId: string, serverId: string): Promise<boolean> {
    const [row] = await tx
      .select({ one: sql`1` })
      .from(vaultSettings)
      .innerJoin(
        vaultModels,
        and(
          eq(vaultModels.organizationId, vaultSettings.organizationId),
          eq(vaultModels.id, vaultSettings.embeddingVaultModelId),
        ),
      )
      .where(
        and(eq(vaultSettings.organizationId, orgId), inArray(vaultModels.credentialId, [serverId])),
      )
      .limit(1)
    return row !== undefined
  }
}

/** Embedding models need a known size an index can hold. */
const storable = <Row extends DiscoveredModelRow>(rows: Row[]): Row[] =>
  rows.filter((row) => row.type !== 'embedding' || row.embeddingDimensions !== null)
