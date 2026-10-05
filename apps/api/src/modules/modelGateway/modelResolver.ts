// SPDX-License-Identifier: AGPL-3.0-only
import { parseModelKey } from '@surefy/contracts'
import type { ModelCallCredentialScope, ModelPickerSource, ModelRefDto } from '@surefy/contracts'

import { ModelNotAllowedError } from './modelGateway.errors.js'

import type { ModelCallContext, ModelSource, ResolvedModel } from './modelGateway.types.js'
import type { SecretCipher } from '@/core/crypto/index.js'
import type { Database, DbExecutor } from '@/core/database/index.js'
import type { AiProviderCredentials, AiProviders } from '@/integrations/ai/index.js'
import type { CredentialRow, VaultModelRow, VaultRepository } from '@/modules/vault/index.js'
import type { VaultAccess } from '@/modules/vault/vault.types.js'

/** What the resolver reads from the vault module. */
export interface ResolverVault {
  repository: VaultRepository
  findModelByKey(
    tx: DbExecutor,
    orgId: string,
    modelKey: string,
  ): Promise<VaultModelRow | undefined>
}

export interface ModelResolverDeps {
  db: Database
  secrets: SecretCipher
  ai: AiProviders
  vault: ResolverVault
  access: VaultAccess
  sources: () => readonly ModelSource[]
}

/** Why a candidate cannot serve: the first candidate's reason is the caller's answer. */
export type Unresolved = { reason: 'not_allowed' } | { reason: 'unavailable'; ref?: ModelRefDto }

const TABLE = 'vault_credentials'

const refOf = (row: VaultModelRow): ModelRefDto => ({
  modelKey: row.modelKey,
  displayName: row.displayName,
  providerKey: row.providerKey,
  source: row.source as ModelPickerSource,
})

/**
 * Turns a model key into a model the AI SDK can call (integrations.md, gateway steps 1 and 3):
 * the model must be enabled, available and allowed to the caller; the key is the caller's
 * personal key (own chats, when allowed), their primary team's, another team's (oldest first), or
 * the organization's; a local model uses its server. Secrets are decrypted for this call only.
 */
export class ModelResolver {
  constructor(private readonly deps: ModelResolverDeps) {}

  async resolve(
    ctx: ModelCallContext,
    modelKey: string,
    kind: 'language' | 'embedding',
  ): Promise<ResolvedModel | Unresolved> {
    const parsed = parseModelKey(modelKey)
    if (parsed === null || parsed.source === 'auto') return { reason: 'not_allowed' }
    if (parsed.source === 'platform') {
      if (ctx.isPrivateChat === true) return { reason: 'not_allowed' }
      for (const source of this.deps.sources()) {
        if (modelKey.startsWith(source.prefix)) {
          return (await source.resolve(ctx, modelKey)) ?? { reason: 'not_allowed' }
        }
      }
      return { reason: 'not_allowed' }
    }
    // personal keys serve only a person's own chats, when the access policy allows them
    const personalAllowed =
      ctx.caller === 'chat' && ctx.userId !== null
        ? (await this.deps.access.providerRules(ctx.orgId, { userId: ctx.userId })).personalKeys
        : false
    return this.deps.db.tenant(ctx.orgId, async (tx) => {
      const model = await this.deps.vault.findModelByKey(tx, ctx.orgId, modelKey)
      if (!model?.isEnabled) return { reason: 'not_allowed' } as const
      if (ctx.allowedModelIds !== 'all' && !ctx.allowedModelIds.includes(model.id)) {
        return { reason: 'not_allowed' } as const
      }
      if (ctx.isPrivateChat === true && model.source !== 'local') {
        return { reason: 'not_allowed' } as const
      }
      if (model.status !== 'available') return { reason: 'unavailable', ref: refOf(model) } as const
      const credential = await this.credentialFor(tx, ctx, model, personalAllowed)
      if (credential === null) return { reason: 'unavailable', ref: refOf(model) } as const
      return this.build(tx, model, credential.row, credential.scope, kind)
    })
  }

  /** The first candidate's refusal: a model the caller may not use is a 403, not an outage. */
  static assertAllowed(result: ResolvedModel | Unresolved): void {
    if ('reason' in result && result.reason === 'not_allowed') throw new ModelNotAllowedError()
  }

  private async credentialFor(
    tx: DbExecutor,
    ctx: ModelCallContext,
    model: VaultModelRow,
    personalAllowed: boolean,
  ): Promise<{ row: CredentialRow; scope: ModelCallCredentialScope } | null> {
    const repository = this.deps.vault.repository
    if (model.source === 'local') {
      if (model.credentialId === null) return null
      const server = await repository.findById(tx, ctx.orgId, model.credentialId)
      return server === undefined || server.status === 'revoked'
        ? null
        : { row: server, scope: 'local' }
    }
    const keys = await repository.resolvableKeys(tx, ctx.orgId, {
      providerKey: model.providerKey,
      userId: personalAllowed ? ctx.userId : null,
      teamIds: ctx.teamIds,
    })
    const ordered = [
      ...keys.filter((key) => key.scope === 'personal'),
      ...keys.filter((key) => key.scope === 'team' && key.teamId === ctx.primaryTeamId),
      ...keys.filter((key) => key.scope === 'team' && key.teamId !== ctx.primaryTeamId),
      ...keys.filter((key) => key.scope === 'organization'),
    ]
    const chosen = ordered[0]
    if (chosen === undefined) return null
    const row = await repository.findById(tx, ctx.orgId, chosen.id)
    return row === undefined ? null : { row, scope: chosen.scope }
  }

  private async build(
    tx: DbExecutor,
    model: VaultModelRow,
    credential: CredentialRow,
    scope: ModelCallCredentialScope,
    kind: 'language' | 'embedding',
  ): Promise<ResolvedModel | Unresolved> {
    const provider = this.deps.ai.get(model.providerKey)
    if (provider === undefined) return { reason: 'unavailable' }
    const secret = await this.deps.secrets.decrypt(
      tx,
      { table: TABLE, id: credential.id, organizationId: credential.organizationId },
      credential,
    )
    const credentials: AiProviderCredentials = {
      ...(secret === null ? {} : { apiKey: secret }),
      ...(credential.baseUrl === null ? {} : { baseUrl: credential.baseUrl }),
    }
    const resolved: ResolvedModel = {
      ref: refOf(model),
      credentialScope: scope,
      credentialId: credential.id,
      vaultModelId: model.id,
      prices: {
        input: model.inputPricePerMtokMicros,
        output: model.outputPricePerMtokMicros,
        cachedInput: model.cachedInputPricePerMtokMicros,
        currency: model.currency,
      },
    }
    if (kind === 'embedding') {
      if (provider.createEmbeddingModel === undefined || model.type !== 'embedding') {
        return { reason: 'not_allowed' }
      }
      return {
        ...resolved,
        embeddingModel: provider.createEmbeddingModel(credentials, model.providerModelId),
      }
    }
    if (model.type === 'embedding') return { reason: 'not_allowed' }
    return {
      ...resolved,
      languageModel: provider.createLanguageModel(credentials, model.providerModelId),
    }
  }
}
