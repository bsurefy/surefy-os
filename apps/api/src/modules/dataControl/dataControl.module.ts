// SPDX-License-Identifier: AGPL-3.0-only
import { DataArchiveRepository } from './dataArchive/dataArchive.repository.js'
import { DataControlController } from './dataControl.controller.js'
import { createDataControlJobs } from './dataControl.jobs.js'
import { DataControlRepository } from './dataControl.repository.js'
import { dataControlRoutes } from './dataControl.routes.js'
import { DataControlService } from './dataControl.service.js'
import { DataExportsService } from './dataExports/dataExports.service.js'
import { CORE_EXPORT_PRODUCERS, type ExportProducer } from './dataExports/exportProducers.js'
import { DataRetentionRepository } from './dataRetention/dataRetention.repository.js'
import { DataRetentionService } from './dataRetention/dataRetention.service.js'

import type {
  DataControlAccess,
  DataControlNotifications,
  DataControlOrganizations,
  DataControlUsers,
} from './dataControl.types.js'
import type { Database } from '@/core/database/index.js'
import type { Logger } from '@/core/logger/index.js'
import type { Queues, RegisteredJob } from '@/core/queue/index.js'
import type { StorageProvider } from '@/integrations/storage/index.js'
import type { AccessService } from '@/modules/access/index.js'
import type { AuditRecorder } from '@/modules/audit/index.js'

export interface DataControlModuleDeps {
  db: Database
  queues: Queues
  storage: StorageProvider
  logger: Logger
  organizations: DataControlOrganizations
  users: DataControlUsers
  notifications: DataControlNotifications
  access: DataControlAccess & Pick<AccessService, 'hasFeature'>
  audit: AuditRecorder
  /** The producing modules' exports (usage CSV…), next to the core ones. */
  producers?: readonly ExportProducer[]
}

export function createDataControlModule(deps: DataControlModuleDeps) {
  const repository = new DataControlRepository()
  // The jobs read the services when they run; the services enqueue the jobs.
  const jobs = createDataControlJobs({
    dataControl: () => service,
    dataExports: () => dataExports,
    retention: () => retention,
  })
  const service = new DataControlService({
    db: deps.db,
    queues: deps.queues,
    storage: deps.storage,
    dataControlRepository: repository,
    dataArchiveRepository: new DataArchiveRepository(),
    organizations: deps.organizations,
    users: deps.users,
    notifications: deps.notifications,
    audit: deps.audit,
    hasFeature: (ctx, feature) => deps.access.hasFeature(ctx, feature),
    prepareDataExportJob: () => jobs.prepareDataExport,
  })
  const dataExports = new DataExportsService({
    db: deps.db,
    queues: deps.queues,
    storage: deps.storage,
    dataControlRepository: repository,
    access: deps.access,
    notifications: deps.notifications,
    audit: deps.audit,
    producers: [...CORE_EXPORT_PRODUCERS, ...(deps.producers ?? [])],
    prepareExportJob: () => jobs.prepareExport,
  })
  const retention = new DataRetentionService({
    db: deps.db,
    queues: deps.queues,
    storage: deps.storage,
    logger: deps.logger,
    dataRetentionRepository: new DataRetentionRepository(),
    purgeOrganizationJob: () => jobs.purgeOrganization,
  })
  return {
    service,
    exports: dataExports,
    retention,
    jobs: [
      jobs.prepareDataExport,
      jobs.prepareExport,
      jobs.purgeOrganization,
      jobs.cleanup,
      jobs.ensurePartitions,
      jobs.purgeSoftDeleted,
      jobs.schedulePurges,
    ] satisfies RegisteredJob[],
    routes: dataControlRoutes(new DataControlController(service, dataExports)),
  }
}
export type DataControlModule = ReturnType<typeof createDataControlModule>
