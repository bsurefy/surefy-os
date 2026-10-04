// SPDX-License-Identifier: AGPL-3.0-only
import { AccessController } from './access.controller.js'
import { AccessRepository } from './access.repository.js'
import { accessRoutes } from './access.routes.js'
import { AccessService } from './access.service.js'

import type { AccessModels, AccessOrganizations, AccessTeams, AccessUsers } from './access.types.js'
import type { EntitlementSource } from './entitlements.types.js'
import type { Cache } from '@/core/cache/index.js'
import type { Database } from '@/core/database/index.js'
import type { ExtensionRegistry } from '@/core/extensions/index.js'
import type { AuditRecorder } from '@/modules/audit/index.js'

export interface AccessModuleDeps {
  db: Database
  cache: Cache
  /** `createEntitlementSource(hooks)`: the extension's source, or Community's. */
  entitlements: EntitlementSource
  hooks: Pick<ExtensionRegistry, 'accessChecks'>
  organizations: AccessOrganizations
  teams: AccessTeams
  users: AccessUsers
  audit: AuditRecorder
  /** The vault module's model grants; nobody has models until it lands. */
  models?: AccessModels
}

/** No Vault models yet: `allowedModelIds` is empty. */
const NO_MODELS: AccessModels = { allowedFor: () => Promise.resolve([]) }

export function createAccessModule(deps: AccessModuleDeps) {
  const service = new AccessService({
    db: deps.db,
    cache: deps.cache,
    accessRepository: new AccessRepository(),
    entitlements: deps.entitlements,
    hooks: deps.hooks,
    organizations: deps.organizations,
    teams: deps.teams,
    users: deps.users,
    models: deps.models ?? NO_MODELS,
    audit: deps.audit,
  })
  return { service, routes: accessRoutes(new AccessController(service)) }
}
export type AccessModule = ReturnType<typeof createAccessModule>
