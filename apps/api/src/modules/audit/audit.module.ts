// SPDX-License-Identifier: AGPL-3.0-only
import { AuditController } from './audit.controller.js'
import { createSealAuditLogJob, createVerifyAuditLogJob } from './audit.jobs.js'
import { AuditRepository } from './audit.repository.js'
import { auditRoutes } from './audit.routes.js'
import { AuditService } from './audit.service.js'
import { AuditVerificationService } from './auditVerification.service.js'

import type { AuditUserRefs } from './audit.types.js'
import type { Cache } from '@/core/cache/index.js'
import type { Database } from '@/core/database/index.js'
import type { Queues } from '@/core/queue/index.js'

export interface AuditModuleDeps {
  db: Database
  cache: Cache
  queues: Queues
  users: AuditUserRefs
}

/**
 * The audit log. Built early in the composition root: every module that changes tenant state
 * records through `audit.service` inside its own transaction.
 */
export function createAuditModule(deps: AuditModuleDeps) {
  const service = new AuditService({
    db: deps.db,
    cache: deps.cache,
    auditRepository: new AuditRepository(),
    users: deps.users,
  })
  const sealJob = createSealAuditLogJob(service)
  const verifyJob = createVerifyAuditLogJob(service)
  const verification = new AuditVerificationService({
    queues: deps.queues,
    audit: service,
    verifyJob,
  })
  return {
    service,
    jobs: [sealJob, verifyJob],
    routes: auditRoutes(new AuditController(service, verification)),
  }
}
export type AuditModule = ReturnType<typeof createAuditModule>
