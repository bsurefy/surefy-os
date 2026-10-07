// SPDX-License-Identifier: AGPL-3.0-only
import type { KnowledgeModelRef, KnowledgeModels } from './knowledge.types.js'
import type { VaultModelRow, ModelGrants } from '@/modules/vault/index.js'

const refOf = (row: VaultModelRow): KnowledgeModelRef => ({
  modelKey: row.modelKey,
  displayName: row.displayName,
  type: row.type,
  source: row.source,
  isEnabled: row.isEnabled,
  status: row.status,
  embeddingDimensions: row.embeddingDimensions,
})

/** The Vault's models as knowledge needs them, over the vault module's repository and service. */
export function createKnowledgeModels(models: ModelGrants): KnowledgeModels {
  const repository = models.modelsRepository
  return {
    async findByKeyInTx(tx, orgId, modelKey) {
      const row = await repository.findByKey(tx, orgId, modelKey)
      return row === undefined ? undefined : refOf(row)
    },
    async findByKeysInTx(tx, orgId, modelKeys) {
      return (await repository.findByKeys(tx, orgId, modelKeys)).map(refOf)
    },
    async organizationEmbeddingModelKeyInTx(tx, orgId) {
      const settings = await repository.settings(tx, orgId)
      if (settings.embeddingVaultModelId === null) return null
      return (
        (await repository.findById(tx, orgId, settings.embeddingVaultModelId))?.modelKey ?? null
      )
    },
    async defaultChatModelKeyInTx(tx, orgId) {
      const fallback = await models.service.fallbackFor(tx, orgId)
      if (fallback.first === null) return null
      const row = await repository.findByKey(tx, orgId, fallback.first.modelKey)
      return row === undefined ? null : refOf(row)
    },
  }
}
