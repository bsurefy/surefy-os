// SPDX-License-Identifier: AGPL-3.0-only
import { NotificationEmailsService } from './notificationEmails/notificationEmails.service.js'
import { NotificationsController } from './notifications.controller.js'
import { createSendEmailJob } from './notifications.jobs.js'
import { NotificationsRepository } from './notifications.repository.js'
import { notificationsRoutes } from './notifications.routes.js'
import { NotificationsService } from './notifications.service.js'

import type { UserRefLookup } from './notifications.types.js'
import type { Config } from '@/core/config/index.js'
import type { Database } from '@/core/database/index.js'
import type { Queues } from '@/core/queue/index.js'
import type { MailProvider } from '@/integrations/mail/index.js'

export interface NotificationsModuleDeps {
  config: Config
  db: Database
  queues: Queues
  mail: MailProvider
  users?: UserRefLookup
}

export function createNotificationsModule(deps: NotificationsModuleDeps) {
  const emails = new NotificationEmailsService({ mail: deps.mail, appName: deps.config.app.name })
  const sendEmailJob = createSendEmailJob(emails)
  const repository = new NotificationsRepository()
  const service = new NotificationsService({
    db: deps.db,
    queues: deps.queues,
    notificationsRepository: repository,
    sendEmailJob,
    ...(deps.users === undefined ? {} : { users: deps.users }),
  })
  return {
    service,
    /** The `email` queue's processors, registered by the worker. */
    jobs: [sendEmailJob],
    routes: notificationsRoutes(new NotificationsController(service)),
  }
}
export type NotificationsModule = ReturnType<typeof createNotificationsModule>
