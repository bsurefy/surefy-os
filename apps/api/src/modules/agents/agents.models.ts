// SPDX-License-Identifier: AGPL-3.0-only
import type { ModelPickerSource, ModelRefDto } from '@surefy/contracts'

import type { AgentsContext, AgentsModels, AudienceSubject } from './agents.types.js'
import type { DbExecutor } from '@/core/database/index.js'
import type { AccessService } from '@/modules/access/index.js'
import type { ModelGrants, VaultModelRow } from '@/modules/vault/index.js'

export interface AgentsModelsDeps {
  /** The vault's models and who may use them. */
  grants: Pick<ModelGrants, 'modelsRepository'>
  /** The provider rules of the access chain (providers, local servers). */
  access: Pick<AccessService, 'providerRulesInTx'>
}

const refOf = (row: VaultModelRow): ModelRefDto => ({
  modelKey: row.modelKey,
  displayName: row.displayName,
  providerKey: row.providerKey,
  source: row.source as ModelPickerSource,
})

/** Who the provider rules of the access chain are read for. */
function providerSubject(subject: AudienceSubject): { userId: string } | { teamId: string } | null {
  if (subject.type === 'organization') return null
  return subject.type === 'team' ? { teamId: subject.teamId } : { userId: subject.userId }
}

/** Who the model access rules are matched against: everyone matches only the organization's rule. */
function modelSubject(subject: AudienceSubject): {
  userId: string | null
  teamIds: readonly string[]
} {
  if (subject.type === 'user') return { userId: subject.userId, teamIds: subject.teamIds }
  return { userId: null, teamIds: subject.type === 'team' ? [subject.teamId] : [] }
}

/** The Vault's models as agents use them: display data, availability, and who may call which. */
export function createAgentsModels(deps: AgentsModelsDeps): AgentsModels {
  const repository = deps.grants.modelsRepository
  return {
    async refs(tx: DbExecutor, orgId: string, modelKeys: readonly string[]) {
      const rows = await repository.findByKeys(tx, orgId, modelKeys)
      return new Map(rows.map((row) => [row.modelKey, refOf(row)]))
    },

    async unavailable(tx: DbExecutor, orgId: string, modelKeys: readonly string[]) {
      const rows = await repository.findByKeys(tx, orgId, modelKeys)
      const usable = new Set(
        rows
          .filter((row) => row.isEnabled && row.status === 'available')
          .map((row) => row.modelKey),
      )
      return new Set(modelKeys.filter((key) => !usable.has(key)))
    },

    async isAllowedFor(tx: DbExecutor, orgId: string, modelKey: string, subject: AudienceSubject) {
      const model = await repository.findByKey(tx, orgId, modelKey)
      if (model === undefined) return false
      const rules = await deps.access.providerRulesInTx(tx, orgId, providerSubject(subject))
      const found = await repository.allowedModels(tx, orgId, modelSubject(subject), {
        providersAllowed: rules.providersAllowed,
        localModels: rules.localModels,
        modelIds: [model.id],
      })
      return found.length > 0
    },

    async allowedFor(tx: DbExecutor, ctx: AgentsContext) {
      const rules = await deps.access.providerRulesInTx(
        tx,
        ctx.orgId,
        ctx.userId === null ? null : { userId: ctx.userId },
      )
      const rows = await repository.allowedModels(
        tx,
        ctx.orgId,
        { userId: ctx.userId, teamIds: ctx.teamIds },
        { providersAllowed: rules.providersAllowed, localModels: rules.localModels },
      )
      return rows.map(refOf)
    },
  }
}
