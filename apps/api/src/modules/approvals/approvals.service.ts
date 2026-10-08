// SPDX-License-Identifier: AGPL-3.0-only

import { AppError } from '@/core/errors/index.js'
import { decodeCursor, toPage } from '@/lib/pagination.js'
import type {
  ApprovalDetailDto,
  ApprovalDto,
  ApprovalStatus,
  ApprovalSummaryDto,
  Approver,
  ApproveApprovalInput,
  BulkDecideInput,
  BulkDecideResultDto,
  ListApprovalsQuery,
  RejectApprovalInput,
} from '@surefy/contracts'
import {
  APPROVAL_AUDIT_ACTIONS,
  APPROVAL_REQUEST_KINDS,
  APPROVAL_STATUSES,
  APPROVALS_ERROR_CODES,
  APPROVERS_MAX,
  approvalPayloadSchema,
} from '@surefy/contracts'

import { canDecidePermission, viewerOf, visibleTo } from './approvals.access.js'
import {
  ApprovalAlreadyDecidedError,
  ApprovalEditInvalidError,
  ApprovalEditNotAllowedError,
  ApprovalExpiredError,
  ApprovalNotAssignedError,
  ApprovalNotCancelableError,
  ApprovalNotFoundError,
  ApprovalNotQuickApprovableError,
} from './approvals.errors.js'
import { approvalSort, isQuickApprovable } from './approvals.repository.js'

import type { ApprovalPresenter } from './approvals.presenter.js'
import type { ApprovalRow, ApprovalsRepository, CancelScope } from './approvals.repository.js'
import type {
  ApprovalSubjects,
  ApprovalsAccess,
  ApprovalsContext,
  ApprovalsGuard,
  ApprovalsOutbox,
  ApprovalsUserRefs,
  CreateApprovalInput,
  CreatedApproval,
} from './approvals.types.js'
import type { Database, DbExecutor } from '@/core/database/index.js'
import type { AuditRecorder } from '@/modules/audit/index.js'

export interface ApprovalsServiceDeps {
  db: Database
  repository: ApprovalsRepository
  presenter: ApprovalPresenter
  access: ApprovalsAccess
  guard: ApprovalsGuard
  subjects: ApprovalSubjects
  users: ApprovalsUserRefs
  audit: AuditRecorder
  outbox: ApprovalsOutbox
  /** The clock; tests pass a fixed one. */
  now?: () => Date
}

const ADMINS: readonly Approver[] = [{ type: 'role', id: 'admin' }]

const TERMINAL_STATUSES = APPROVAL_STATUSES.filter((status) => status !== 'pending')

/** The decision as the shared path receives it. */
interface Decision {
  status: 'approved' | 'rejected'
  via: 'queue' | 'popover' | 'notification' | 'bulk'
  reason: RejectApprovalInput['reason'] | null
  note: string | null
  editedInput: Readonly<Record<string, unknown>> | undefined
}

interface Found {
  approval: ApprovalRow
  assignedToViewer: boolean
}

/**
 * The approval queue and its decisions (database/guard-and-approvals.md, §4–5). Approvals are
 * created by Guard, the bridge and agent publishing through `create`, in the transaction that
 * pauses the run or records the request; people decide them through the routes. The run side of a
 * decision belongs to the module that owns the run: it hears `approval.decided` and
 * `approval.expired` from the outbox.
 */
export class ApprovalsService {
  constructor(private readonly deps: ApprovalsServiceDeps) {}

  private now(): Date {
    return this.deps.now?.() ?? new Date()
  }

  /**
   * Without `status` the queue answers: pending, oldest first. `decidedToday` and decided
   * statuses answer newest first. People without `guard:manage` see what they can decide, what
   * they requested and what the agents and flows module opens to them.
   */
  async list(
    ctx: ApprovalsContext,
    query: ListApprovalsQuery,
  ): Promise<{ items: ApprovalDto[]; nextCursor: string | null }> {
    const now = this.now()
    const decidedToday = query.decidedToday === true
    const statuses = statusesOf(query)
    const sort = approvalSort(query.sort, !statuses.includes('pending'))
    return this.deps.db.tenant(ctx.orgId, async (tx) => {
      const limits = await this.deps.guard.limits(tx, ctx.orgId)
      const rows = await this.deps.repository.listPage(tx, ctx.orgId, {
        limit: query.limit,
        sort,
        statuses,
        limits,
        viewer: viewerOf(ctx),
        visibility: visibleTo(ctx, this.deps.subjects),
        ...(query.cursor === undefined ? {} : { cursor: decodeCursor(query.cursor) }),
        ...(query.q === undefined ? {} : { q: query.q }),
        ...(query.kind === undefined ? {} : { kinds: query.kind }),
        ...(query.risk === undefined ? {} : { risks: query.risk }),
        ...(query.agentId === undefined ? {} : { agentId: query.agentId }),
        ...(query.ruleRef === undefined ? {} : { ruleRef: query.ruleRef }),
        ...(query.canDecide === undefined ? {} : { canDecide: query.canDecide }),
        ...(query.quickApprovable === undefined ? {} : { quickApprovable: query.quickApprovable }),
        ...(decidedToday ? { decidedSince: startOfDay(now) } : {}),
      })
      const { items, nextCursor } = toPage(rows, query.limit, (row) => ({
        k: row.sortKey,
        id: row.approval.id,
      }))
      return { items: await this.deps.presenter.present(tx, ctx, items, limits, now), nextCursor }
    })
  }

  /** Pending approvals per agent, for the Agents list. */
  waitingCountsByAgent(
    tx: DbExecutor,
    orgId: string,
    agentIds: readonly string[],
  ): Promise<ReadonlyMap<string, number>> {
    return this.deps.repository.pendingCountsByAgent(tx, orgId, agentIds)
  }

  /** The badge and the queue header, over the same rows the queue shows. */
  async summary(ctx: ApprovalsContext): Promise<ApprovalSummaryDto> {
    const now = this.now()
    return this.deps.db.tenant(ctx.orgId, async (tx) => {
      const limits = await this.deps.guard.limits(tx, ctx.orgId)
      return this.deps.repository.counts(tx, ctx.orgId, {
        viewer: viewerOf(ctx),
        visibility: visibleTo(ctx, this.deps.subjects),
        overdueBefore: new Date(now.getTime() - limits.targetDecisionMinutes * 60_000),
        decidedSince: startOfDay(now),
      })
    })
  }

  async get(ctx: ApprovalsContext, approvalId: string): Promise<ApprovalDetailDto> {
    const now = this.now()
    return this.deps.db.tenant(ctx.orgId, async (tx) => {
      const found = await this.findOrThrow(tx, ctx, approvalId)
      const limits = await this.deps.guard.limits(tx, ctx.orgId)
      return this.deps.presenter.presentDetail(tx, ctx, found, limits, now)
    })
  }

  /**
   * Approves, or approves with `editedInput` ("Edit and approve"). An item above the step-up
   * amount needs a sign-in within the last 10 minutes; nothing is recorded without it.
   */
  async approve(
    ctx: ApprovalsContext,
    approvalId: string,
    input: ApproveApprovalInput,
  ): Promise<ApprovalDetailDto> {
    await this.decideAndKick(ctx, approvalId, {
      status: 'approved',
      via: input.via,
      reason: null,
      note: null,
      editedInput: input.editedInput,
    })
    return this.get(ctx, approvalId)
  }

  async reject(
    ctx: ApprovalsContext,
    approvalId: string,
    input: RejectApprovalInput,
  ): Promise<ApprovalDetailDto> {
    await this.decideAndKick(ctx, approvalId, {
      status: 'rejected',
      via: 'queue',
      reason: input.reason,
      note: input.note ?? null,
      editedInput: undefined,
    })
    return this.get(ctx, approvalId)
  }

  /**
   * Bulk approve or reject: only items of the rule of the first item that fit the quick-approve
   * limits and need no step-up. Each item is decided in its own transaction with its own
   * conditional update, so one item's conflict never undoes another.
   */
  async bulkDecide(ctx: ApprovalsContext, input: BulkDecideInput): Promise<BulkDecideResultDto> {
    const limits = await this.deps.db.tenant(ctx.orgId, (tx) =>
      this.deps.guard.limits(tx, ctx.orgId),
    )
    const first = await this.deps.db.tenant(ctx.orgId, (tx) =>
      this.deps.repository.findOne(
        tx,
        ctx.orgId,
        input.ids[0] ?? '',
        viewerOf(ctx),
        visibleTo(ctx, this.deps.subjects),
      ),
    )
    const ruleRef = first?.approval.ruleRef ?? null
    const results: BulkDecideResultDto['results'] = []
    for (const id of input.ids) {
      try {
        await this.deps.db.tenant(ctx.orgId, async (tx) => {
          const found = await this.findOrThrow(tx, ctx, id)
          const row = found.approval
          if (
            row.status === 'pending' &&
            (ruleRef === null || row.ruleRef !== ruleRef || !isQuickApprovable(row, limits))
          ) {
            throw new ApprovalNotQuickApprovableError()
          }
          await this.decideInTx(tx, ctx, found, {
            status: input.decision === 'approve' ? 'approved' : 'rejected',
            via: 'bulk',
            reason: input.decision === 'reject' ? (input.reason ?? null) : null,
            note: input.decision === 'reject' ? (input.note ?? null) : null,
            editedInput: undefined,
          })
        })
        results.push({ id, outcome: 'decided', errorCode: null })
      } catch (error) {
        if (!(error instanceof AppError) || !isApprovalsCode(error.code)) throw error
        results.push({ id, outcome: 'skipped', errorCode: error.code })
      }
    }
    await this.deps.outbox.kick()
    return { results }
  }

  /** The requester takes back their own pending request (bridge install, channel publish). */
  async withdraw(ctx: ApprovalsContext, approvalId: string): Promise<ApprovalDetailDto> {
    await this.deps.db.tenant(ctx.orgId, async (tx) => {
      await this.findOrThrow(tx, ctx, approvalId)
      const row =
        ctx.userId === null
          ? undefined
          : await this.deps.repository.withdraw(tx, ctx.orgId, approvalId, ctx.userId)
      if (row === undefined) throw new ApprovalNotCancelableError()
      await this.deps.audit.record(tx, ctx, {
        action: APPROVAL_AUDIT_ACTIONS.APPROVAL_CANCELED,
        target: { type: 'approval', id: row.id },
        metadata: { labels: { kind: row.kind, by: 'requester' } },
      })
    })
    return this.get(ctx, approvalId)
  }

  /**
   * For Guard, the bridge and agent publishing: records the approval, its assignees, the audit
   * entry `approval.requested` and the outbox event that tells the assignees, in the caller's
   * transaction. A retry with the same `dedupeKey` returns the first approval and writes nothing.
   * The request kinds always go to role `admin`.
   */
  async create(
    tx: DbExecutor,
    ctx: ApprovalsContext,
    input: CreateApprovalInput,
  ): Promise<CreatedApproval> {
    const payload = approvalPayloadSchema.parse(input.payload)
    if (payload.kind !== input.kind) throw new Error('approval payload does not match its kind')
    const limits = await this.deps.guard.limits(tx, ctx.orgId)
    const amount = input.amountMicros ?? null
    const wait = input.waitMinutes ?? null
    const now = this.now()
    const { row, created } = await this.deps.repository.insertOrFind(tx, {
      organizationId: ctx.orgId,
      kind: input.kind,
      title: input.title,
      payload,
      amountMicros: amount,
      confidence: input.confidence ?? null,
      risk: input.risk ?? 'low',
      ruleRef: input.ruleRef ?? null,
      dedupeKey: input.dedupeKey ?? null,
      agentId: input.agentId ?? null,
      agentRunId: input.agentRunId ?? null,
      flowId: input.flowId ?? null,
      flowRunId: input.flowRunId ?? null,
      requestedByUserId: input.requestedByUserId ?? null,
      requiresStepUp:
        limits.stepUpAmountMicros !== null && (amount ?? 0) > limits.stepUpAmountMicros,
      expiresAt: wait === null ? null : new Date(now.getTime() + wait * 60_000),
      timeoutAction: wait === null ? null : (input.timeoutAction ?? 'reject'),
      ...(input.currency === undefined ? {} : { currency: input.currency }),
    })
    if (!created) return { id: row.id, created: false }
    const assignees = this.assigneesFor(input)
    await this.deps.repository.insertAssignees(tx, ctx.orgId, row.id, assignees, 'rule')
    await this.deps.audit.record(tx, ctx, {
      action: APPROVAL_AUDIT_ACTIONS.APPROVAL_REQUESTED,
      target: { type: 'approval', id: row.id },
      metadata: {
        labels: {
          kind: row.kind,
          risk: row.risk,
          ruleRef: row.ruleRef,
          stepUp: row.requiresStepUp,
        },
        counts: { assignees: assignees.length },
      },
      ...(row.agentId !== null && row.kind === 'ai_action'
        ? { actor: { type: 'agent' as const, refId: row.agentId } }
        : {}),
      ...(row.confidence === null ? {} : { confidence: row.confidence }),
    })
    await this.deps.outbox.write(tx, {
      orgId: ctx.orgId,
      topic: 'approval.requested',
      payload: { version: 1, id: row.id },
      dedupeKey: `approval.requested:${row.id}`,
      ...(ctx.requestId === undefined ? {} : { requestId: ctx.requestId }),
    })
    return { id: row.id, created: true }
  }

  /**
   * A canceled run, an archived agent or a deleted flow takes back what it left waiting, in the
   * same transaction as its own status change (`resolved_by = 'system'`). Returns the ids.
   */
  async cancelPending(
    tx: DbExecutor,
    ctx: ApprovalsContext,
    scope: CancelScope,
  ): Promise<string[]> {
    const rows = await this.deps.repository.cancelPending(tx, ctx.orgId, scope)
    for (const row of rows) {
      await this.deps.audit.record(tx, ctx, {
        action: APPROVAL_AUDIT_ACTIONS.APPROVAL_CANCELED,
        target: { type: 'approval', id: row.id },
        metadata: { labels: { kind: row.kind, by: 'system' } },
      })
    }
    return rows.map((row) => row.id)
  }

  /**
   * An approval must never become undecidable: when the last person or team that could decide it
   * is about to go (a member removed, a team deleted), role `admin` is added in the same
   * transaction. Call it before the removal; the leaving person or team is ignored.
   */
  async reassignWithoutAssignees(
    tx: DbExecutor,
    orgId: string,
    leaving: { userId?: string; teamId?: string },
  ): Promise<number> {
    const ids = await this.deps.repository.withoutLiveAssignee(tx, orgId, leaving)
    for (const id of ids) {
      await this.deps.repository.insertAssignees(tx, orgId, id, ADMINS, 'rule')
    }
    return ids.length
  }

  // ── Deciding ─────────────────────────────────────────────────────────────────────────────────

  private async decideAndKick(
    ctx: ApprovalsContext,
    approvalId: string,
    decision: Decision,
  ): Promise<void> {
    await this.deps.db.tenant(ctx.orgId, async (tx) => {
      const found = await this.findOrThrow(tx, ctx, approvalId)
      await this.decideInTx(tx, ctx, found, decision)
    })
    await this.deps.outbox.kick()
  }

  /**
   * One decision in the caller's transaction. Order: who may decide, then whether it is still
   * open, then the fresh sign-in, then the edited fields, then the conditional update.
   */
  private async decideInTx(
    tx: DbExecutor,
    ctx: ApprovalsContext,
    found: Found,
    decision: Decision,
  ): Promise<void> {
    const approval = found.approval
    await this.assertMayDecide(tx, ctx, found)
    if (approval.status !== 'pending' || this.isDue(approval)) {
      throw await this.conflictFor(approval)
    }
    if (decision.status === 'approved' && approval.requiresStepUp) {
      this.deps.access.assertFreshSession(ctx)
    }
    const editedPayload = await this.editedPayload(tx, ctx, approval, decision.editedInput)
    const row = await this.deps.repository.decide(tx, ctx.orgId, approval.id, {
      status: decision.status,
      editedPayload,
      reason: decision.reason,
      note: decision.note,
      userId: ctx.userId ?? '',
    })
    if (row === undefined) {
      const current = await this.deps.repository.findById(tx, ctx.orgId, approval.id)
      throw current === undefined ? new ApprovalNotFoundError() : await this.conflictFor(current)
    }
    await this.deps.audit.record(tx, ctx, {
      action: APPROVAL_AUDIT_ACTIONS.APPROVAL_DECIDED,
      target: { type: 'approval', id: row.id },
      reason: decision.note,
      metadata: {
        labels: {
          kind: row.kind,
          decision: decision.status,
          via: decision.via,
          reason: decision.reason,
          edited: editedPayload !== null,
          stepUp: decision.status === 'approved' && row.requiresStepUp,
        },
      },
      ...(row.confidence === null ? {} : { confidence: row.confidence }),
    })
    await this.deps.outbox.write(tx, {
      orgId: ctx.orgId,
      topic: 'approval.decided',
      payload: { version: 1, id: row.id },
      dedupeKey: `approval.decided:${row.id}`,
      ...(ctx.requestId === undefined ? {} : { requestId: ctx.requestId }),
    })
  }

  /** `approvals:decide`, an assignee row that names the person, and access to the agent or flow. */
  private async assertMayDecide(
    tx: DbExecutor,
    ctx: ApprovalsContext,
    found: Found,
  ): Promise<void> {
    const allowed =
      ctx.userId !== null &&
      canDecidePermission(ctx) &&
      found.assignedToViewer &&
      (await this.deps.presenter.canAccessSubject(tx, ctx, found.approval))
    if (!allowed) throw new ApprovalNotAssignedError()
  }

  /** Only AI actions and flow steps have fields to edit; the edited input is merged over the original. */
  private async editedPayload(
    tx: DbExecutor,
    ctx: ApprovalsContext,
    approval: ApprovalRow,
    editedInput: Readonly<Record<string, unknown>> | undefined,
  ): Promise<ApprovalRow['payload'] | null> {
    if (editedInput === undefined) return null
    const payload = approval.payload
    if (payload.kind !== 'ai_action' && payload.kind !== 'flow_step') {
      throw new ApprovalEditNotAllowedError()
    }
    const invalid = await this.deps.subjects.invalidEditFields(tx, ctx.orgId, approval, editedInput)
    if (invalid.length > 0) throw new ApprovalEditInvalidError(invalid)
    return {
      ...payload,
      action: { ...payload.action, input: { ...payload.action.input, ...editedInput } },
    }
  }

  /** The error for an approval that is no longer open to a decision. */
  private async conflictFor(approval: ApprovalRow): Promise<AppError> {
    if (approval.status === 'expired' || (approval.status === 'pending' && this.isDue(approval))) {
      return new ApprovalExpiredError(approval.timeoutAction)
    }
    const decidedBy =
      approval.decidedByUserId === null
        ? null
        : ((await this.deps.users.findUserRefs([approval.decidedByUserId])).get(
            approval.decidedByUserId,
          ) ?? null)
    return new ApprovalAlreadyDecidedError(
      decidedBy === null ? null : { id: decidedBy.id, name: decidedBy.name },
      approval.status,
    )
  }

  /** The wait ran out; the sweeper has not taken the timeout action yet. */
  private isDue(approval: ApprovalRow): boolean {
    return (
      approval.status === 'pending' &&
      approval.expiresAt !== null &&
      approval.expiresAt.getTime() <= this.now().getTime()
    )
  }

  private async findOrThrow(tx: DbExecutor, ctx: ApprovalsContext, approvalId: string) {
    const found = await this.deps.repository.findOne(
      tx,
      ctx.orgId,
      approvalId,
      viewerOf(ctx),
      visibleTo(ctx, this.deps.subjects),
    )
    if (found === undefined) throw new ApprovalNotFoundError()
    return found
  }

  private assigneesFor(input: CreateApprovalInput): readonly Approver[] {
    if ((APPROVAL_REQUEST_KINDS as readonly string[]).includes(input.kind)) return ADMINS
    const given = input.assignees ?? []
    if (given.length === 0) return ADMINS
    return given.slice(0, APPROVERS_MAX)
  }
}

const APPROVALS_CODES: ReadonlySet<string> = new Set(Object.values(APPROVALS_ERROR_CODES))

const isApprovalsCode = (code: string): code is keyof typeof APPROVALS_ERROR_CODES =>
  APPROVALS_CODES.has(code)

/** The statuses a list asks for: pending by default, the decided ones for "Decided today". */
function statusesOf(query: ListApprovalsQuery): readonly ApprovalStatus[] {
  if (query.status !== undefined && query.status.length > 0) return query.status
  return query.decidedToday === true ? TERMINAL_STATUSES : ['pending']
}

/** UTC midnight of the day `now` falls in: the start of "Decided today". */
function startOfDay(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
}
