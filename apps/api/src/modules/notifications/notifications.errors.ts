// SPDX-License-Identifier: AGPL-3.0-only
import { ForbiddenError, NotFoundError } from '@/core/errors/index.js'
import { ERROR_CODES } from '@surefy/contracts'

/** Not one of the current member's notifications (another member's answers the same). */
export class NotificationNotFoundError extends NotFoundError {
  constructor() {
    super(ERROR_CODES.NOTIFICATION_NOT_FOUND, 'Notification not found')
  }
}

/** Notifications belong to a person: API keys and system actors have none. */
export class NotificationsPersonRequiredError extends ForbiddenError {
  constructor() {
    super(ERROR_CODES.ACCESS_FORBIDDEN, 'Notifications are available to signed-in members only')
  }
}
