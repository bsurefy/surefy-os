// SPDX-License-Identifier: AGPL-3.0-only
import type { OrganizationDto } from '@surefy/contracts'

import type { DbExecutor } from '@/core/database/index.js'
import type { AuditContext } from '@/modules/audit/index.js'
import type { NotifyInput } from '@/modules/notifications/index.js'
import type { OutboxEventInput } from '@/modules/outbox/index.js'

/** Who changes budgets, for the audit entry: the request's tenant context. */
export type BudgetsContext = AuditContext

/** The organization's currency and access version (organizations module). */
export interface BudgetsOrganizations {
  getInTx(tx: DbExecutor, orgId: string): Promise<OrganizationDto | undefined>
  bumpAccessVersionInTx(tx: DbExecutor, orgId: string): Promise<void>
}

/** Writes in-app notifications (notifications module). */
export interface BudgetsNotifier {
  notify(ctx: { orgId: string }, input: NotifyInput): Promise<unknown>
}

/** Writes an outbox event in the caller's transaction (outbox module). */
export interface BudgetsOutbox {
  write(
    tx: DbExecutor,
    event: OutboxEventInput<'budgets.changed' | 'budget.threshold_reached'>,
  ): Promise<boolean>
}
