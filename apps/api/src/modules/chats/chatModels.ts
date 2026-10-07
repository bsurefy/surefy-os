// SPDX-License-Identifier: AGPL-3.0-only
import { sql } from 'drizzle-orm'

import { vaultModels } from '@/database/tables/index.js'

import type { ChatModelInfo, ChatModels } from './chats.types.js'
import type { ModelGrants, VaultModelRow } from '@/modules/vault/index.js'

const FIRST_USABLE_SCAN = 100
const sortByName = sql`lower(${vaultModels.displayName})`

const infoOf = (row: VaultModelRow): ChatModelInfo => ({
  id: row.id,
  modelKey: row.modelKey,
  displayName: row.displayName,
  providerKey: row.providerKey,
  source: row.source as ChatModelInfo['source'],
  supportsVision: row.supportsVision,
  isEnabled: row.isEnabled,
  isAvailable: row.status === 'available',
})

/** The Vault's models as chats read them. */
export function createChatModels(repository: ModelGrants['modelsRepository']): ChatModels {
  return {
    async find(tx, orgId, modelKey) {
      const row = await repository.findByKey(tx, orgId, modelKey)
      return row?.type === 'chat' ? infoOf(row) : undefined
    },
    async firstUsable(tx, orgId, allowedModelIds, { localOnly }) {
      if (allowedModelIds !== 'all' && allowedModelIds.length === 0) return
      const allowed = allowedModelIds === 'all' ? null : new Set(allowedModelIds)
      const rows = await repository.listPage(tx, orgId, {
        limit: FIRST_USABLE_SCAN,
        sort: { expression: sortByName, cast: 'text', descending: false },
        filters: {
          type: ['chat'],
          status: ['available'],
          isEnabled: true,
          ...(localOnly ? { source: ['local'] } : {}),
        },
      })
      const usable = rows.find((row) => allowed === null || allowed.has(row.model.id))
      return usable === undefined ? undefined : infoOf(usable.model)
    },
  }
}
