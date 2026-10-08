// SPDX-License-Identifier: AGPL-3.0-only
import { APPROVAL_AUDIT_ACTIONS } from '@surefy/contracts'

import { MIN_ESCALATION_WAIT_MS, SYSTEM_REASON, TIMEOUT_BATCH } from './approvals.constants.js'
import { DEFAULT_ESCALATION } from './approvals.types.js'

import type { ApprovalsRepository } from './approvals.repository.js'
import type { ApprovalsGuard, ApprovalsOutbox } from './approvals.types.js'
import type { Database, DbExecutor } from '@/core/database/index.js'
import type { Logger } from '@/core/logger/index.js'
import type { AuditRecorder } from '@/modules/audit/index.js'

export interface ApprovalTimeoutsDeps {
  db: Database
  repository: ApprovalsRepository
  guard: ApprovalsGuard
  audit: AuditRecorder
  outbox: ApprovalsOutbox
  logger: Logger
}

export interface TimeoutRun {
  due: number
  expired: number
  escalated: number
  skipped: number
  failed: number
}

type Outcome = 'expired' | 'escalated' | 'skipped'

/**
 * `approval-timeouts` (database/guard-and-approvals.md, "Timeout handling"): approvals whose wait
 * ran out take the action their rule named. Each one is handled in its own organization's
 * transaction with the conditional predicate of a decision, so a person deciding at the same
 * moment wins or loses cleanly.
 */
export class ApprovalTimeouts {
  constructor(private readonly deps: ApprovalTimeoutsDeps) {}

  async run(): Promise<TimeoutRun> {
    const due = await this.deps.db.system(SYSTEM_REASON, (tx) =>
      this.deps.repository.dueForTimeout(tx, TIMEOUT_BATCH),
    )
    const run: TimeoutRun = { due: due.length, expired: 0, escalated: 0, skipped: 0, failed: 0 }
    for (const item of due) {
      try {
        const outcome = await this.deps.db.tenant(item.organizationId, (tx) =>
          this.handle(tx, item.organizationId, item.id),
        )
        run[outcome] += 1
      } catch (error) {
        run.failed += 1
        this.deps.logger.error(
          { err: error, orgId: item.organizationId, approvalId: item.id },
          'approval timeout failed',
        )
      }
    }
    if (run.expired + run.escalated > 0) await this.deps.outbox.kick()
    return run
  }

  private async handle(tx: DbExecutor, orgId: string, id: string): Promise<Outcome> {
    const ctx = { orgId, userId: null, via: 'system' as const, requestId: SYSTEM_REASON }
    const row = await this.deps.repository.findById(tx, orgId, id)
    if (row?.status !== 'pending' || row.expiresAt === null) return 'skipped'

    // the first timeout of an escalating approval: waits again for the escalation approvers
    if (row.timeoutAction === 'escalate' && row.escalatedAt === null) {
      const wait = Math.max(
        row.expiresAt.getTime() - row.createdAt.getTime(),
        MIN_ESCALATION_WAIT_MS,
      )
      const escalated = await this.deps.repository.escalate(tx, orgId, id, wait)
      if (escalated === undefined) return 'skipped'
      const targets = await this.deps.guard.escalationTargets(tx, orgId, escalated)
      await this.deps.repository.insertAssignees(
        tx,
        orgId,
        id,
        targets.length === 0 ? DEFAULT_ESCALATION : targets,
        'escalation',
      )
      await this.deps.audit.record(tx, ctx, {
        action: APPROVAL_AUDIT_ACTIONS.APPROVAL_ESCALATED,
        target: { type: 'approval', id },
        metadata: { labels: { kind: escalated.kind }, counts: { assignees: targets.length } },
      })
      await this.deps.outbox.write(tx, {
        orgId,
        topic: 'approval.escalated',
        payload: { version: 1, id },
        dedupeKey: `approval.escalated:${id}`,
        requestId: SYSTEM_REASON,
      })
      return 'escalated'
    }

    const expired = await this.deps.repository.expire(tx, orgId, id)
    if (expired === undefined) return 'skipped'
    await this.deps.audit.record(tx, ctx, {
      action: APPROVAL_AUDIT_ACTIONS.APPROVAL_EXPIRED,
      target: { type: 'approval', id },
      metadata: {
        // an escalation that already happened once ends as a rejection
        labels: {
          kind: expired.kind,
          timeoutAction: expired.timeoutAction === 'continue' ? 'continue' : 'reject',
        },
      },
    })
    await this.deps.outbox.write(tx, {
      orgId,
      topic: 'approval.expired',
      payload: { version: 1, id },
      dedupeKey: `approval.expired:${id}`,
      requestId: SYSTEM_REASON,
    })
    return 'expired'
  }
}
