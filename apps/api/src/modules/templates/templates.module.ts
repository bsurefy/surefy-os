// SPDX-License-Identifier: AGPL-3.0-only
import { TemplatesController } from './templates.controller.js'
import { templatesRoutes } from './templates.routes.js'
import { TemplatesService } from './templates.service.js'
import { NO_BRIDGES } from './templates.types.js'

import type { TemplateBridges, TemplateModels } from './templates.types.js'
import type { Database } from '@/core/database/index.js'

export interface TemplatesModuleDeps {
  db: Database
  models: TemplateModels
  /** The installed bridges; none until the bridge module provides them. */
  bridges?: TemplateBridges
}

/** Agent templates: code only, no tables (product-modules-map). */
export function createTemplatesModule(deps: TemplatesModuleDeps) {
  const service = new TemplatesService({
    db: deps.db,
    models: deps.models,
    bridges: deps.bridges ?? NO_BRIDGES,
  })
  return { service, routes: templatesRoutes(new TemplatesController(service)) }
}
export type TemplatesModule = ReturnType<typeof createTemplatesModule>
