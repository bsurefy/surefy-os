// SPDX-License-Identifier: AGPL-3.0-only
import { outboxHandler } from '@/modules/outbox/index.js'
import type { NotificationParams } from '@surefy/contracts'

import type { ConnectionsRepository } from './connections.repository.js'
import type { ConnectionsNotifier } from './connections.types.js'
import type { Database } from '@/core/database/index.js'
import type { Logger } from '@/core/logger/index.js'

export interface ConnectionExpiredDeps {
  db: Database
  repository: ConnectionsRepository
  notifications: ConnectionsNotifier
  logger: Logger
}

/**
 * `connection.expired`: tells the person who connected it, or the Admins and Owners when that
 * person is gone. The handlers of other modules pause the flows, mark the channels and skip the
 * syncs that depended on it, and tell the owners of affected agents and flows. Delivery is at
 * least once: the notification's dedupe key makes a second delivery a no-op.
 */
export const createConnectionExpiredHandler = (deps: ConnectionExpiredDeps) =>
  outboxHandler('connection.expired', 'connections.notify-expired', async (delivery) => {
    if (delivery.orgId === null) return
    const orgId = delivery.orgId
    const { row, recipients } = await deps.db.tenant(orgId, async (tx) => {
      const found = await deps.repository.findById(tx, orgId, delivery.payload.id)
      if (found === undefined) return { row: undefined, recipients: [] as string[] }
      const connectedBy = found.connectedByUserId
      if (connectedBy !== null && (await deps.repository.isActiveMember(tx, orgId, connectedBy))) {
        return { row: found, recipients: [connectedBy] }
      }
      return { row: found, recipients: await deps.repository.managerIds(tx, orgId) }
    })
    // reconnected or disconnected since: nothing to tell
    if (row?.status !== 'expired') return
    const params: NotificationParams = {
      version: 1,
      name: row.name,
      providerKey: row.providerKey,
      reasonCode: row.statusReasonCode,
    }
    for (const userId of recipients) {
      await deps.notifications.notify(
        { orgId },
        {
          userId,
          type: 'connection.expired',
          params,
          target: { type: 'connection', id: row.id },
          dedupeKey: `connection.expired:${delivery.eventId}`,
        },
      )
    }
    deps.logger.info(
      { orgId, connectionId: row.id, notified: recipients.length },
      'connection expired',
    )
  })
