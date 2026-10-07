// SPDX-License-Identifier: AGPL-3.0-only
import { ModelGatewayService } from './modelGateway.service.js'
import { ModelResolver } from './modelResolver.js'

import type { ModelCallGuard, ModelSource, UsageRecorder } from './modelGateway.types.js'
import type { Crypto } from '@/core/crypto/index.js'
import type { Database } from '@/core/database/index.js'
import type { Logger } from '@/core/logger/index.js'
import type { AiProviders } from '@/integrations/ai/index.js'
import type { ModelGrants, VaultModule } from '@/modules/vault/index.js'
import type { VaultAccess } from '@/modules/vault/vault.types.js'

export interface ModelGatewayModuleDeps {
  db: Database
  logger: Logger
  crypto: Crypto
  ai: AiProviders
  vault: VaultModule
  models: ModelGrants
  access: VaultAccess
  hooks: { modelSources(): readonly ModelSource[]; modelCallGuards(): readonly ModelCallGuard[] }
  /** The usage module's metering; until it lands every call is written to the log. */
  usage?: UsageRecorder
}

/** Metering until the usage module exists: one structured log line per call, never content. */
export function logUsageRecorder(logger: Logger): UsageRecorder {
  return {
    record({ ctx, result, credentialId, outcome, errorCode }) {
      logger.info(
        {
          orgId: ctx.orgId,
          userId: ctx.userId,
          caller: ctx.caller,
          modelKey: result.model.modelKey,
          credentialId,
          credentialScope: result.credentialScope,
          outcome,
          errorCode,
          fallbackFrom: result.fallback?.from.modelKey ?? null,
          ...result.usage,
        },
        'model call',
      )
      return Promise.resolve()
    },
  }
}

export function createModelGatewayModule(deps: ModelGatewayModuleDeps) {
  const resolver = new ModelResolver({
    db: deps.db,
    secrets: deps.crypto.secrets,
    ai: deps.ai,
    vault: {
      repository: deps.vault.repository,
      findModelByKey: (tx, orgId, modelKey) =>
        deps.models.modelsRepository.findByKey(tx, orgId, modelKey),
    },
    access: deps.access,
    sources: () => deps.hooks.modelSources(),
  })
  const service = new ModelGatewayService({
    db: deps.db,
    resolver,
    fallbackOf: (orgId) =>
      deps.db.tenant(
        orgId,
        async (tx) => (await deps.models.modelsRepository.settings(tx, orgId)).fallback,
      ),
    vaultRepository: deps.vault.repository,
    guards: () => deps.hooks.modelCallGuards(),
    usage: deps.usage ?? logUsageRecorder(deps.logger),
    logger: deps.logger,
  })
  return { service }
}
export type ModelGatewayModule = ReturnType<typeof createModelGatewayModule>
