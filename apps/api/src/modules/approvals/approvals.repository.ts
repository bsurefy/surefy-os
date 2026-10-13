// SPDX-License-Identifier: AGPL-3.0-only
import {
  and,
  eq,
  gt,
  gte,
  ilike,
  inArray,
  isNull,
  lt,
  lte,
  notInArray,
  or,
  sql,
  type SQL,
} from 'drizzle-orm'

import {
  approvalAssignees,
  approvals,
  organizationMembers,
  teamMembers,
} from '@/database/tables/index.js'
import {
  keysetAfter,
  keysetKey,
  keysetOrder,
  parseSort,
  type KeysetCursor,
  type KeysetSort,
} from '@/lib/pagination.js'
import { ORG_ROLES } from '@surefy/contracts'
import type {
  Approver,
  ApprovalDecisionReason,
  ApprovalKind,
  ApprovalPayload,
  ApprovalRisk,
  ApprovalStatus,
  OrgRole,
} from '@surefy/contracts'

import type { ApprovalLimits } from './approvals.types.js'
import type { DbExecutor } from '@/core/database/index.js'

export type ApprovalRow = typeof approvals.$inferSelect
export type NewApprovalRow = typeof approvals.$inferInsert
export type AssigneeRow = typeof approvalAssignees.$inferSelect

const a = approvals
const s = approvalAssignees

const allOf = (...conditions: (SQL | undefined)[]): SQL => and(...conditions) ?? sql`true`

/** Escapes `%`, `_` and `\` so a search term matches literally. */
const likeTerm = (q: string): string => `%${q.replaceAll(/[\\%_]/g, (ch) => '\\' + ch)}%`

/** Kinds an AI produced; the others are requests Admins and Owners decide one by one. */
export const AI_KINDS: readonly ApprovalKind[] = ['ai_action', 'flow_step']

const RISK_ORDER: readonly ApprovalRisk[] = ['low', 'medium', 'high']

/** The risks quick approve accepts: `low`, or `low` and `medium`. */
export const risksUpTo = (max: 'low' | 'medium'): ApprovalRisk[] =>
  RISK_ORDER.slice(0, RISK_ORDER.indexOf(max) + 1)

/** Built-in roles at or below `role`: the assignee roles a person with `role` matches. */
export const rolesAtOrBelow = (role: OrgRole | null | undefined): OrgRole[] =>
  role === null || role === undefined ? [] : ORG_ROLES.slice(0, ORG_ROLES.indexOf(role) + 1)

/** The person for whom "can decide" is computed. */
export interface Viewer {
  userId: string | null
  teamIds: readonly string[]
  role: OrgRole | null | undefined
}

/**
 * Assignee rows that name the viewer: themselves, one of their teams, or a role at or below their
 * own (database/guard-and-approvals.md, "Queries and access paths").
 */
export function assignedTo(viewer: Viewer): SQL {
  const match: (SQL | undefined)[] = []
  if (viewer.userId !== null) match.push(eq(s.userId, viewer.userId))
  if (viewer.teamIds.length > 0) match.push(inArray(s.teamId, [...viewer.teamIds]))
  const roles = rolesAtOrBelow(viewer.role)
  if (roles.length > 0) match.push(inArray(s.role, roles))
  const any = or(...match)
  if (any === undefined) return sql`false`
  return sql`exists (select 1 from ${s} where ${s.organizationId} = ${a.organizationId}
    and ${s.approvalId} = ${a.id} and ${any})`
}

/** Fits the quick-approve limits: pending, no step-up, an AI kind, low enough risk and amount. */
export function quickApprovableSql(limits: ApprovalLimits): SQL {
  return allOf(
    eq(a.status, 'pending'),
    eq(a.requiresStepUp, false),
    inArray(a.kind, [...AI_KINDS]),
    inArray(a.risk, risksUpTo(limits.quickApproveMaxRisk)),
    lte(sql`coalesce(${a.amountMicros}, 0)`, limits.quickApproveMaxAmountMicros),
  )
}

/** The same rule as `quickApprovableSql`, for one row. */
export function isQuickApprovable(row: ApprovalRow, limits: ApprovalLimits): boolean {
  return (
    row.status === 'pending' &&
    !row.requiresStepUp &&
    AI_KINDS.includes(row.kind) &&
    risksUpTo(limits.quickApproveMaxRisk).includes(row.risk) &&
    (row.amountMicros ?? 0) <= limits.quickApproveMaxAmountMicros
  )
}

/** `?sort=` of the list. Pending items default to oldest first, decided ones to newest first. */
export const approvalSort = (sort: string | undefined, decided: boolean): KeysetSort => {
  const { field, descending } = parseSort<'createdAt' | 'decidedAt' | 'amountMicros'>(
    sort,
    decided ? '-decidedAt' : 'createdAt',
  )
  if (field === 'createdAt') return { expression: a.createdAt, cast: 'timestamptz', descending }
  if (field === 'decidedAt') {
    return {
      expression: sql`coalesce(${a.decidedAt}, ${a.createdAt})`,
      cast: 'timestamptz',
      descending,
    }
  }
  return { expression: sql`coalesce(${a.amountMicros}, -1)`, cast: 'bigint', descending }
}

export interface ApprovalPageParams {
  limit: number
  sort: KeysetSort
  cursor?: KeysetCursor
  q?: string
  statuses: readonly ApprovalStatus[]
  kinds?: readonly ApprovalKind[]
  risks?: readonly ApprovalRisk[]
  agentId?: string
  ruleRef?: string
  canDecide?: boolean
  quickApprovable?: boolean
  decidedSince?: Date
  limits: ApprovalLimits
  viewer: Viewer
  /** Rows the viewer may see at all (undefined: every row). */
  visibility: SQL | undefined
}

export interface ApprovalCounts {
  pending: number
  pendingForMe: number
  overdue: number
  decidedToday: number
}

export interface DecisionValues {
  status: 'approved' | 'rejected'
  editedPayload: ApprovalPayload | null
  reason: ApprovalDecisionReason | null
  note: string | null
  userId: string
}

/** What a cancel by the system matches: the pending approvals of a run, an agent or a flow. */
export interface CancelScope {
  /** One request (a removed channel takes back its publish request). */
  approvalId?: string
  agentRunId?: string
  flowRunId?: string
  agentId?: string
  flowId?: string
}

/**
 * `approvals` and `approval_assignees`. Every tenant query filters by organization even though RLS
 * does too. A decision is one conditional update (database/guard-and-approvals.md, "Approval
 * decision race"): the row goes to a terminal status only if it is still pending and not expired.
 */
export class ApprovalsRepository {
  /**
   * Inserts the approval, or returns the one a retry of the same step created first
   * (`dedupe_key`). The assignees are written by the caller when `created` is true.
   */
  async insertOrFind(
    tx: DbExecutor,
    values: NewApprovalRow,
  ): Promise<{ row: ApprovalRow; created: boolean }> {
    const [row] = await tx
      .insert(a)
      .values(values)
      .onConflictDoNothing({
        target: [a.organizationId, a.dedupeKey],
        where: sql`${a.dedupeKey} is not null`,
      })
      .returning()
    if (row !== undefined) return { row, created: true }
    if (values.dedupeKey === undefined || values.dedupeKey === null) {
      throw new Error('approval insert returned no row')
    }
    const existing = await tx.query.approvals.findFirst({
      where: and(eq(a.organizationId, values.organizationId), eq(a.dedupeKey, values.dedupeKey)),
    })
    if (existing === undefined) throw new Error('approval insert conflicted without a row')
    return { row: existing, created: false }
  }

  async insertAssignees(
    tx: DbExecutor,
    orgId: string,
    approvalId: string,
    assignees: readonly Approver[],
    source: 'rule' | 'escalation',
  ): Promise<void> {
    if (assignees.length === 0) return
    await tx
      .insert(s)
      .values(
        assignees.map((assignee) => ({
          organizationId: orgId,
          approvalId,
          subjectType: assignee.type,
          userId: assignee.type === 'user' ? assignee.id : null,
          teamId: assignee.type === 'team' ? assignee.id : null,
          role: assignee.type === 'role' ? assignee.id : null,
          source,
        })),
      )
      .onConflictDoNothing()
  }

  findById(tx: DbExecutor, orgId: string, id: string) {
    return tx.query.approvals.findFirst({ where: and(eq(a.organizationId, orgId), eq(a.id, id)) })
  }

  /** Every approval a run created, for the run engine's resume. */
  async findByRun(tx: DbExecutor, orgId: string, runId: string): Promise<ApprovalRow[]> {
    return tx
      .select()
      .from(a)
      .where(and(eq(a.organizationId, orgId), eq(a.agentRunId, runId)))
  }

  async findByIds(tx: DbExecutor, orgId: string, ids: readonly string[]): Promise<ApprovalRow[]> {
    if (ids.length === 0) return []
    return tx
      .select()
      .from(a)
      .where(and(eq(a.organizationId, orgId), inArray(a.id, [...ids])))
  }

  async assigneesOf(
    tx: DbExecutor,
    orgId: string,
    approvalIds: readonly string[],
  ): Promise<AssigneeRow[]> {
    if (approvalIds.length === 0) return []
    return tx
      .select()
      .from(s)
      .where(and(eq(s.organizationId, orgId), inArray(s.approvalId, [...approvalIds])))
      .orderBy(s.createdAt, s.id)
  }

  /** Whether the viewer is among the assignees of each approval. */
  async assignedAmong(
    tx: DbExecutor,
    orgId: string,
    viewer: Viewer,
    approvalIds: readonly string[],
  ): Promise<Set<string>> {
    if (approvalIds.length === 0) return new Set()
    const rows = await tx
      .select({ id: a.id })
      .from(a)
      .where(and(eq(a.organizationId, orgId), inArray(a.id, [...approvalIds]), assignedTo(viewer)))
    return new Set(rows.map((row) => row.id))
  }

  /** One approval the viewer may see, and whether their assignee rows name it. */
  async findOne(
    tx: DbExecutor,
    orgId: string,
    id: string,
    viewer: Viewer,
    visibility: SQL | undefined,
  ): Promise<{ approval: ApprovalRow; assignedToViewer: boolean } | undefined> {
    const [row] = await tx
      .select({ approval: a, assignedToViewer: sql<boolean>`${assignedTo(viewer)}` })
      .from(a)
      .where(allOf(eq(a.organizationId, orgId), eq(a.id, id), visibility))
      .limit(1)
    return row
  }

  /** The queue page: the approval, its sort key for the cursor and whether the viewer may decide it. */
  listPage(tx: DbExecutor, orgId: string, page: ApprovalPageParams) {
    const mine = assignedTo(page.viewer)
    return tx
      .select({
        approval: a,
        sortKey: keysetKey(page.sort),
        assignedToViewer: sql<boolean>`${mine}`,
      })
      .from(a)
      .where(
        allOf(
          eq(a.organizationId, orgId),
          inArray(a.status, [...page.statuses]),
          page.q === undefined ? undefined : ilike(a.title, likeTerm(page.q)),
          page.kinds === undefined || page.kinds.length === 0
            ? undefined
            : inArray(a.kind, [...page.kinds]),
          page.risks === undefined || page.risks.length === 0
            ? undefined
            : inArray(a.risk, [...page.risks]),
          page.agentId === undefined ? undefined : eq(a.agentId, page.agentId),
          page.ruleRef === undefined ? undefined : eq(a.ruleRef, page.ruleRef),
          page.canDecide === true ? mine : undefined,
          page.quickApprovable === true ? quickApprovableSql(page.limits) : undefined,
          page.decidedSince === undefined ? undefined : gte(a.decidedAt, page.decidedSince),
          page.visibility,
          keysetAfter(page.sort, a.id, page.cursor),
        ),
      )
      .orderBy(...keysetOrder(page.sort, a.id))
      .limit(page.limit + 1)
  }

  /** Pending approvals per agent, for the Agents list; agents with none are absent. */
  async pendingCountsByAgent(
    tx: DbExecutor,
    orgId: string,
    agentIds: readonly string[],
  ): Promise<Map<string, number>> {
    if (agentIds.length === 0) return new Map()
    const rows = await tx
      .select({
        agentId: a.agentId,
        count: sql<number>`count(*)`.mapWith(Number),
      })
      .from(a)
      .where(
        and(
          eq(a.organizationId, orgId),
          eq(a.status, 'pending'),
          inArray(a.agentId, [...agentIds]),
        ),
      )
      .groupBy(a.agentId)
    return new Map(
      rows.flatMap((row) => (row.agentId === null ? [] : [[row.agentId, row.count] as const])),
    )
  }

  /** The badge and the queue header, for the items the viewer sees. */
  async counts(
    tx: DbExecutor,
    orgId: string,
    params: {
      viewer: Viewer
      visibility: SQL | undefined
      overdueBefore: Date
      decidedSince: Date
    },
  ): Promise<ApprovalCounts> {
    const mine = assignedTo(params.viewer)
    const [row] = await tx
      .select({
        pending: sql<number>`count(*) filter (where ${eq(a.status, 'pending')})`
          .mapWith(Number)
          .as('pending'),
        pendingForMe: sql<number>`count(*) filter (where ${eq(a.status, 'pending')} and ${mine})`
          .mapWith(Number)
          .as('pending_for_me'),
        overdue:
          sql<number>`count(*) filter (where ${eq(a.status, 'pending')} and ${lt(a.createdAt, params.overdueBefore)})`
            .mapWith(Number)
            .as('overdue'),
        decidedToday: sql<number>`count(*) filter (where ${gte(a.decidedAt, params.decidedSince)})`
          .mapWith(Number)
          .as('decided_today'),
      })
      .from(a)
      .where(
        allOf(
          eq(a.organizationId, orgId),
          or(eq(a.status, 'pending'), gte(a.decidedAt, params.decidedSince)),
          params.visibility,
        ),
      )
    return {
      pending: 0,
      pendingForMe: 0,
      overdue: 0,
      decidedToday: 0,
      ...row,
    }
  }

  /**
   * The decision: one conditional update. No row means someone else decided first, the wait ran
   * out, or the approval does not exist; the caller re-reads to tell which.
   */
  async decide(
    tx: DbExecutor,
    orgId: string,
    id: string,
    values: DecisionValues,
  ): Promise<ApprovalRow | undefined> {
    const [row] = await tx
      .update(a)
      .set({
        status: values.status,
        editedPayload: values.editedPayload,
        decisionReason: values.reason,
        decisionNote: values.note,
        decidedByUserId: values.userId,
        decidedAt: sql`now()`,
        resolvedBy: 'user',
        updatedAt: sql`now()`,
      })
      .where(
        and(
          eq(a.organizationId, orgId),
          eq(a.id, id),
          eq(a.status, 'pending'),
          or(isNull(a.expiresAt), gt(a.expiresAt, sql`now()`)),
        ),
      )
      .returning()
    return row
  }

  /** The requester withdraws their own pending request. */
  async withdraw(
    tx: DbExecutor,
    orgId: string,
    id: string,
    userId: string,
  ): Promise<ApprovalRow | undefined> {
    const [row] = await tx
      .update(a)
      .set({
        status: 'canceled',
        decidedByUserId: userId,
        decidedAt: sql`now()`,
        resolvedBy: 'user',
        updatedAt: sql`now()`,
      })
      .where(
        and(
          eq(a.organizationId, orgId),
          eq(a.id, id),
          eq(a.status, 'pending'),
          eq(a.requestedByUserId, userId),
          notInArray(a.kind, [...AI_KINDS]),
        ),
      )
      .returning()
    return row
  }

  /** The system cancels what a canceled run, an archived agent or a deleted flow left waiting. */
  async cancelPending(tx: DbExecutor, orgId: string, scope: CancelScope): Promise<ApprovalRow[]> {
    const target = or(
      scope.approvalId === undefined ? undefined : eq(a.id, scope.approvalId),
      scope.agentRunId === undefined ? undefined : eq(a.agentRunId, scope.agentRunId),
      scope.flowRunId === undefined ? undefined : eq(a.flowRunId, scope.flowRunId),
      scope.agentId === undefined ? undefined : eq(a.agentId, scope.agentId),
      scope.flowId === undefined ? undefined : eq(a.flowId, scope.flowId),
    )
    if (target === undefined) return []
    return tx
      .update(a)
      .set({
        status: 'canceled',
        decidedAt: sql`now()`,
        resolvedBy: 'system',
        updatedAt: sql`now()`,
      })
      .where(and(eq(a.organizationId, orgId), eq(a.status, 'pending'), target))
      .returning()
  }

  /** Pending approvals whose wait ran out, oldest first (system scope; `approvals_expiry_idx`). */
  dueForTimeout(tx: DbExecutor, limit: number) {
    return tx
      .select({ id: a.id, organizationId: a.organizationId })
      .from(a)
      .where(
        and(eq(a.status, 'pending'), sql`${a.expiresAt} is not null`, lte(a.expiresAt, sql`now()`)),
      )
      .orderBy(a.expiresAt)
      .limit(limit)
  }

  /** The timeout took its action: `reject` and `continue` both end `expired`. */
  async expire(tx: DbExecutor, orgId: string, id: string): Promise<ApprovalRow | undefined> {
    const [row] = await tx
      .update(a)
      .set({
        status: 'expired',
        decidedAt: sql`now()`,
        resolvedBy: 'timeout',
        updatedAt: sql`now()`,
      })
      .where(
        and(
          eq(a.organizationId, orgId),
          eq(a.id, id),
          eq(a.status, 'pending'),
          lte(a.expiresAt, sql`now()`),
        ),
      )
      .returning()
    return row
  }

  /** The first timeout of an `escalate` approval: stays pending and waits again. */
  async escalate(
    tx: DbExecutor,
    orgId: string,
    id: string,
    waitMs: number,
  ): Promise<ApprovalRow | undefined> {
    const [row] = await tx
      .update(a)
      .set({
        escalatedAt: sql`now()`,
        expiresAt: sql`now() + ${waitMs} * interval '1 millisecond'`,
        updatedAt: sql`now()`,
      })
      .where(
        and(
          eq(a.organizationId, orgId),
          eq(a.id, id),
          eq(a.status, 'pending'),
          eq(a.timeoutAction, 'escalate'),
          isNull(a.escalatedAt),
          lte(a.expiresAt, sql`now()`),
        ),
      )
      .returning()
    return row
  }

  /**
   * Pending approvals that no longer have anyone who can decide them, ignoring one person or one
   * team that is about to go: assignee rows of a role always count; a person counts while an
   * active member; a team counts while it has an active member.
   */
  async withoutLiveAssignee(
    tx: DbExecutor,
    orgId: string,
    leaving: { userId?: string; teamId?: string },
  ): Promise<string[]> {
    const notLeaving =
      leaving.userId === undefined ? sql`` : sql`and m.user_id <> ${leaving.userId}`
    const memberActive = (userId: SQL | typeof s.userId) =>
      sql`exists (select 1 from ${organizationMembers} m where m.organization_id = ${a.organizationId}
        and m.user_id = ${userId} and m.status = 'active' ${notLeaving})`
    const live = or(
      sql`${s.role} is not null`,
      and(sql`${s.userId} is not null`, memberActive(s.userId)),
      and(
        sql`${s.teamId} is not null`,
        leaving.teamId === undefined ? undefined : sql`${s.teamId} <> ${leaving.teamId}`,
        sql`exists (select 1 from ${teamMembers} tm
          join ${organizationMembers} m on m.organization_id = tm.organization_id and m.user_id = tm.user_id
          where tm.organization_id = ${a.organizationId} and tm.team_id = ${s.teamId}
            and m.status = 'active' ${notLeaving})`,
      ),
    )
    const rows = await tx
      .select({ id: a.id })
      .from(a)
      .where(
        and(
          eq(a.organizationId, orgId),
          eq(a.status, 'pending'),
          sql`not exists (select 1 from ${s} where ${s.organizationId} = ${a.organizationId}
            and ${s.approvalId} = ${a.id} and ${live})`,
        ),
      )
    return rows.map((row) => row.id)
  }

  /** Active members who hold one of the roles, a team, or are named: the people to notify. */
  async activeUserIds(
    tx: DbExecutor,
    orgId: string,
    assignees: readonly Pick<AssigneeRow, 'subjectType' | 'userId' | 'teamId' | 'role'>[],
  ): Promise<string[]> {
    const users = new Set<string>()
    const userIds = assignees.flatMap((row) => (row.userId === null ? [] : [row.userId]))
    const teamIds = assignees.flatMap((row) => (row.teamId === null ? [] : [row.teamId]))
    const roles = assignees.flatMap((row) => (row.role === null ? [] : rolesAtOrAbove(row.role)))
    const m = organizationMembers
    const clauses: SQL[] = []
    if (userIds.length > 0) clauses.push(inArray(m.userId, userIds))
    if (roles.length > 0) clauses.push(inArray(m.role, [...new Set(roles)]))
    if (teamIds.length > 0) {
      clauses.push(
        sql`${m.userId} in (select ${teamMembers.userId} from ${teamMembers}
          where ${teamMembers.organizationId} = ${orgId} and ${inArray(teamMembers.teamId, teamIds)})`,
      )
    }
    const any = or(...clauses)
    if (any === undefined) return []
    const rows = await tx
      .select({ userId: m.userId })
      .from(m)
      .where(and(eq(m.organizationId, orgId), eq(m.status, 'active'), any))
    for (const row of rows) users.add(row.userId)
    return [...users]
  }
}

/** Built-in roles that satisfy an assignee `role`: the role and every role above it. */
export const rolesAtOrAbove = (role: OrgRole): OrgRole[] => ORG_ROLES.slice(ORG_ROLES.indexOf(role))
