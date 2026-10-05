// SPDX-License-Identifier: AGPL-3.0-only
import { ModelsRepository } from './models.repository.js'
import { ModelsService } from './models.service.js'
import { ModelSync } from './modelSync.js'
import { VaultController } from './vault.controller.js'
import {
  createCheckServersJob,
  createExpireKeysJob,
  createRotateKeysJob,
  createSyncModelsJob,
} from './vault.jobs.js'
import { VaultRepository } from './vault.repository.js'
import { vaultRoutes } from './vault.routes.js'
import { VaultService } from './vault.service.js'
import { NO_USAGE } from './vault.types.js'
import { VaultKeysRepository } from './vaultKeys.repository.js'
import { VaultKeysService } from './vaultKeys.service.js'
import { VaultMaintenance } from './vaultMaintenance.js'

import type {
  VaultAccess,
  VaultOrganizations,
  VaultTeams,
  VaultUsage,
  VaultUserRefs,
} from './vault.types.js'
import type { VaultMaintenanceDeps } from './vaultMaintenance.js'
import type { Crypto } from '@/core/crypto/index.js'
import type { Database } from '@/core/database/index.js'
import type { Logger } from '@/core/logger/index.js'
import type { AiProviders } from '@/integrations/ai/index.js'
import type { AuditRecorder } from '@/modules/audit/index.js'

export interface ModelGrantsDeps {
  db: Database
  organizations: VaultOrganizations
  teams: VaultTeams
  users: VaultUserRefs
  audit: AuditRecorder
}

/**
 * The models half of the vault, created before the access module: access reads
 * `allowedModelIds` from it, and the vault module itself is created after access.
 */
export function createModelGrants(deps: ModelGrantsDeps) {
  const modelsRepository = new ModelsRepository()
  const service = new ModelsService({ ...deps, modelsRepository })
  return { service, modelsRepository }
}
export type ModelGrants = ReturnType<typeof createModelGrants>

export interface VaultModuleDeps {
  db: Database
  crypto: Crypto
  ai: AiProviders
  models: ModelGrants
  access: VaultAccess
  organizations: VaultOrganizations
  teams: VaultTeams
  users: VaultUserRefs
  audit: AuditRecorder
  /** The usage module's spend and users per key; none until it lands. */
  usage?: VaultUsage
  /** Shared with the member removal step, created before the members module. */
  repository?: VaultRepository
  notifications: VaultMaintenanceDeps['notifications']
  logger: Logger
}

export function createVaultModule(deps: VaultModuleDeps) {
  const vaultRepository = deps.repository ?? new VaultRepository()
  const modelSync = new ModelSync(deps.models.modelsRepository, deps.organizations)
  const service = new VaultService({
    db: deps.db,
    secrets: deps.crypto.secrets,
    ai: deps.ai,
    vaultRepository,
    modelSync,
    models: deps.models.service,
    access: deps.access,
    teams: deps.teams,
    users: deps.users,
    usage: deps.usage ?? NO_USAGE,
    audit: deps.audit,
  })
  const maintenance = new VaultMaintenance({
    db: deps.db,
    secrets: deps.crypto.secrets,
    ai: deps.ai,
    repository: vaultRepository,
    modelSync,
    notifications: deps.notifications,
    audit: deps.audit,
    logger: deps.logger,
  })
  const keys = new VaultKeysService({
    db: deps.db,
    crypto: deps.crypto,
    repository: new VaultKeysRepository(),
    audit: deps.audit,
    logger: deps.logger,
  })
  return {
    service,
    maintenance,
    /** Data key rotation, re-encryption and the master key re-wrap (`cli keys …`, Cloud console). */
    keys,
    jobs: [
      createExpireKeysJob(maintenance),
      createSyncModelsJob(maintenance),
      createCheckServersJob(maintenance),
      createRotateKeysJob(keys, deps.crypto.masterKeys.previous !== undefined),
    ],
    models: deps.models.service,
    grants: deps.models,
    crypto: deps.crypto,
    repository: vaultRepository,
    routes: vaultRoutes(new VaultController(service, deps.models.service)),
  }
}
export type VaultModule = ReturnType<typeof createVaultModule>
