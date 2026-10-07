// SPDX-License-Identifier: AGPL-3.0-only
import { SETUP_DEFAULTS } from './setup.constants.js'
import { SetupController } from './setup.controller.js'
import { SetupRepository } from './setup.repository.js'
import { setupRoutes } from './setup.routes.js'
import { SetupService, type SetupServiceDeps } from './setup.service.js'

import type { SetupAudit, SetupChecklistCheck, SetupGpuProbe } from './setup.types.js'

export type SetupModuleDeps = Omit<
  SetupServiceDeps,
  'setupRepository' | 'checklist' | 'audit' | 'gpu'
> & {
  /** Checklist items of other modules (vault, knowledge, agents, usage) as they land. */
  checklist?: readonly SetupChecklistCheck[]
  /** The audit module's record of setup; not recorded by default. */
  audit?: SetupAudit
  /** GPU detection (ML service); none by default. */
  gpu?: SetupGpuProbe
}

/** Built after Better Auth: setup creates the first account through it and signs the Owner in. */
export function createSetupModule(deps: SetupModuleDeps) {
  const service = new SetupService({
    ...deps,
    setupRepository: new SetupRepository(),
    checklist: deps.checklist ?? [],
    audit: deps.audit ?? SETUP_DEFAULTS.audit,
    gpu: deps.gpu ?? SETUP_DEFAULTS.gpu,
  })
  return { service, routes: setupRoutes(new SetupController(service)) }
}
export type SetupModule = ReturnType<typeof createSetupModule>
