// SPDX-License-Identifier: AGPL-3.0-only
export { createNotificationsModule, type NotificationsModule } from './notifications.module.js'
export type { NotificationsService } from './notifications.service.js'
export type { SendEmailJob } from './notifications.jobs.js'
export type { EmailTemplate, SendEmailPayload } from './notifications.schema.js'
export type {
  EmailDeliveryListener,
  NotificationsContext,
  NotifyInput,
  UserRefLookup,
} from './notifications.types.js'
