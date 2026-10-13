// SPDX-License-Identifier: AGPL-3.0-only
import { outboxHandler } from '@/modules/outbox/index.js'
import { APPROVAL_REQUEST_KINDS } from '@surefy/contracts'
import type { NotificationParams } from '@surefy/contracts'

import type { ApprovalRow, ApprovalsRepository } from './approvals.repository.js'
import type { ApprovalsNotifier } from './approvals.types.js'
import type { Database } from '@/core/database/index.js'
import type { Logger } from '@/core/logger/index.js'

export interface ApprovalHandlersDeps {
  db: Database
  repository: ApprovalsRepository
  notifications: ApprovalsNotifier
  logger: Logger
}

const isRequestKind = (kind: string): boolean =>
  (APPROVAL_REQUEST_KINDS as readonly string[]).includes(kind)

const paramsOf = (
  row: ApprovalRow,
  extra: NotificationParams = { version: 1 },
): NotificationParams => ({
  ...extra,
  version: 1,
  title: row.title,
  kind: row.kind,
  risk: row.risk,
  amountMicros: row.amountMicros,
  currency: row.currency,
})

/**
 * The notifications of the approvals module, from the outbox (delivery is at least once: each
 * notification's dedupe key makes a second delivery a no-op):
 *
 * - `approval.requested`: every person who can decide it (a person, the members of a team, the
 *   holders of a role or above), except the one who asked.
 * - `approval.escalated`: the people added by the escalation.
 * - `approval.decided` and `approval.expired`: the requester of a bridge install or channel
 *   publish. AI actions have no requester; their run continues from the same events in the
 *   module that owns it.
 */
export function createApprovalHandlers(deps: ApprovalHandlersDeps) {
  const notifyAssignees =
    (source: 'rule' | 'escalation', handlerName: string) =>
    async (delivery: { eventId: string; orgId: string | null; payload: { id: string } }) => {
      if (delivery.orgId === null) return
      const orgId = delivery.orgId
      const { row, recipients } = await deps.db.tenant(orgId, async (tx) => {
        const found = await deps.repository.findById(tx, orgId, delivery.payload.id)
        // decided, canceled or expired since: nothing left to ask
        if (found?.status !== 'pending') return { row: undefined, recipients: [] as string[] }
        const assignees = (await deps.repository.assigneesOf(tx, orgId, [found.id])).filter(
          (assignee) => assignee.source === source,
        )
        const userIds = await deps.repository.activeUserIds(tx, orgId, assignees)
        return { row: found, recipients: userIds.filter((id) => id !== found.requestedByUserId) }
      })
      if (row === undefined) return
      for (const userId of recipients) {
        await deps.notifications.notify(
          { orgId },
          {
            userId,
            type: 'approval.requested',
            params: paramsOf(row, { version: 1, escalated: source === 'escalation' }),
            target: { type: 'approval', id: row.id },
            dedupeKey: `${handlerName}:${delivery.eventId}`,
          },
        )
      }
      deps.logger.info({ orgId, approvalId: row.id, notified: recipients.length }, handlerName)
    }

  const notifyRequester =
    (handlerName: string) =>
    async (delivery: { eventId: string; orgId: string | null; payload: { id: string } }) => {
      if (delivery.orgId === null) return
      const orgId = delivery.orgId
      const row = await deps.db.tenant(orgId, (tx) =>
        deps.repository.findById(tx, orgId, delivery.payload.id),
      )
      if (row === undefined) return
      const requester = row.requestedByUserId
      if (requester === null || !isRequestKind(row.kind)) return
      if (row.status === 'pending' || row.status === 'canceled') return
      await deps.notifications.notify(
        { orgId },
        {
          userId: requester,
          type: 'approval.decided',
          params: paramsOf(row, {
            version: 1,
            outcome: row.status,
            reason: row.decisionReason,
          }),
          target: { type: 'approval', id: row.id },
          ...(row.decidedByUserId === null ? {} : { actorUserId: row.decidedByUserId }),
          dedupeKey: `${handlerName}:${delivery.eventId}`,
        },
      )
    }

  return [
    outboxHandler('approval.requested', 'approvals.notify-requested', (delivery) =>
      notifyAssignees('rule', 'approvals.notify-requested')(delivery),
    ),
    outboxHandler('approval.escalated', 'approvals.notify-escalated', (delivery) =>
      notifyAssignees('escalation', 'approvals.notify-escalated')(delivery),
    ),
    outboxHandler('approval.decided', 'approvals.notify-decided', (delivery) =>
      notifyRequester('approvals.notify-decided')(delivery),
    ),
    outboxHandler('approval.expired', 'approvals.notify-expired', (delivery) =>
      notifyRequester('approvals.notify-expired')(delivery),
    ),
  ]
}
