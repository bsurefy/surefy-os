// SPDX-License-Identifier: AGPL-3.0-only
import { ORGANIZATIONS_DEFAULTS } from './organizations.constants.js'
import { OrganizationsController } from './organizations.controller.js'
import { OrganizationsRepository } from './organizations.repository.js'
import { organizationsRoutes } from './organizations.routes.js'
import { OrganizationsService } from './organizations.service.js'

import type {
  InstallLimitsSource,
  OrganizationCreationRule,
  OrganizationOwnerWriter,
} from './organizations.types.js'
import type { Database } from '@/core/database/index.js'
import type { StorageProvider } from '@/integrations/storage/index.js'

export interface OrganizationsModuleDeps {
  db: Database
  storage: StorageProvider
  /** The members module's Owner membership writer. */
  owners: OrganizationOwnerWriter
  /** The entitlement source's install limits (access module); Community's by default. */
  installLimits?: InstallLimitsSource
  /** The install's organization creation policy (install module); nobody by default. */
  creationRule?: OrganizationCreationRule
}

export function createOrganizationsModule(deps: OrganizationsModuleDeps) {
  const service = new OrganizationsService({
    db: deps.db,
    storage: deps.storage,
    organizationsRepository: new OrganizationsRepository(),
    owners: deps.owners,
    installLimits: deps.installLimits ?? ORGANIZATIONS_DEFAULTS.installLimits,
    creationRule: deps.creationRule ?? ORGANIZATIONS_DEFAULTS.creationRule,
  })
  return { service, routes: organizationsRoutes(new OrganizationsController(service)) }
}
export type OrganizationsModule = ReturnType<typeof createOrganizationsModule>
