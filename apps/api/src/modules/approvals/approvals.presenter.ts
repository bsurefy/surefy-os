// SPDX-License-Identifier: AGPL-3.0-only
import type {
  ApprovalAssigneeDto,
  ApprovalDetailDto,
  ApprovalDto,
  TeamRefDto,
  UserRefDto,
} from '@surefy/contracts'

import { canDecidePermission } from './approvals.access.js'
import { isQuickApprovable } from './approvals.repository.js'

import type { ApprovalRow, ApprovalsRepository, AssigneeRow } from './approvals.repository.js'
import type {
  ApprovalLimits,
  ApprovalSubjects,
  ApprovalsContext,
  ApprovalsGuard,
  ApprovalsTeams,
  ApprovalsUserRefs,
} from './approvals.types.js'
import type { DbExecutor } from '@/core/database/index.js'

export interface ApprovalPresenterDeps {
  repository: ApprovalsRepository
  users: ApprovalsUserRefs
  teams: ApprovalsTeams
  subjects: ApprovalSubjects
  guard: ApprovalsGuard
}

/** An approval row and whether the viewer's assignee rows name it. */
export interface PresentedRow {
  approval: ApprovalRow
  assignedToViewer: boolean
}

/** Builds the DTOs: assignees, people, team and agent names, and what the viewer may do. */
export class ApprovalPresenter {
  constructor(private readonly deps: ApprovalPresenterDeps) {}

  async present(
    tx: DbExecutor,
    ctx: ApprovalsContext,
    rows: readonly PresentedRow[],
    limits: ApprovalLimits,
    now: Date,
  ): Promise<ApprovalDto[]> {
    if (rows.length === 0) return []
    const refs = await this.loadRefs(
      tx,
      ctx.orgId,
      rows.map((row) => row.approval),
    )
    const { users, teamById, names, ruleNames, assigneesOf } = refs
    const overdueBefore = now.getTime() - limits.targetDecisionMinutes * 60_000
    const mayDecide = canDecidePermission(ctx)
    const dtos: ApprovalDto[] = []
    for (const { approval, assignedToViewer } of rows) {
      const canDecide =
        mayDecide &&
        assignedToViewer &&
        approval.status === 'pending' &&
        (await this.canAccessSubject(tx, ctx, approval))
      dtos.push({
        id: approval.id,
        kind: approval.kind,
        status: approval.status,
        title: approval.title,
        amountMicros: approval.amountMicros,
        currency: approval.currency,
        confidence: approval.confidence,
        risk: approval.risk,
        ruleRef: approval.ruleRef,
        ruleName: approval.ruleRef === null ? null : (ruleNames.get(approval.ruleRef) ?? null),
        agent: idName(approval.agentId, names.agents),
        flow: idName(approval.flowId, names.flows),
        agentRunId: approval.agentRunId,
        flowRunId: approval.flowRunId,
        requestedBy: ref(users, approval.requestedByUserId),
        decidedBy: ref(users, approval.decidedByUserId),
        decidedAt: approval.decidedAt?.toISOString() ?? null,
        decisionReason: approval.decisionReason,
        decisionNote: approval.decisionNote,
        requiresStepUp: approval.requiresStepUp,
        expiresAt: approval.expiresAt?.toISOString() ?? null,
        timeoutAction: approval.timeoutAction,
        escalatedAt: approval.escalatedAt?.toISOString() ?? null,
        resolvedBy: approval.resolvedBy,
        assignees: (assigneesOf.get(approval.id) ?? []).map((row) =>
          toAssigneeDto(row, users, teamById),
        ),
        canDecide,
        isOverdue: approval.status === 'pending' && approval.createdAt.getTime() < overdueBefore,
        quickApprovable: isQuickApprovable(approval, limits),
        createdAt: approval.createdAt.toISOString(),
        updatedAt: approval.updatedAt.toISOString(),
      })
    }
    return dtos
  }

  /** Everything the DTOs name besides the approvals themselves, loaded in one round. */
  private async loadRefs(tx: DbExecutor, orgId: string, approvalRows: readonly ApprovalRow[]) {
    const assignees = await this.deps.repository.assigneesOf(
      tx,
      orgId,
      approvalRows.map((row) => row.id),
    )
    const userIds = new Set<string>(compact(assignees.map((row) => row.userId)))
    for (const row of approvalRows) {
      for (const id of compact([row.requestedByUserId, row.decidedByUserId])) userIds.add(id)
    }
    const teamIds = unique(compact(assignees.map((row) => row.teamId)))
    // one transaction runs one query at a time
    const users = await this.deps.users.findUserRefs([...userIds])
    const teams: TeamRefDto[] =
      teamIds.length === 0 ? [] : await this.deps.teams.findRefsInTx(tx, orgId, teamIds)
    const names = await this.deps.subjects.names(tx, orgId, {
      agentIds: unique(compact(approvalRows.map((row) => row.agentId))),
      flowIds: unique(compact(approvalRows.map((row) => row.flowId))),
    })
    const ruleNames = await this.deps.guard.ruleNames(
      tx,
      orgId,
      unique(compact(approvalRows.map((row) => row.ruleRef))),
    )
    const assigneesOf = new Map<string, AssigneeRow[]>()
    for (const row of assignees) {
      const list = assigneesOf.get(row.approvalId) ?? []
      list.push(row)
      assigneesOf.set(row.approvalId, list)
    }
    return {
      users,
      teamById: new Map(teams.map((team) => [team.id, team])),
      names,
      ruleNames,
      assigneesOf,
    }
  }

  async presentDetail(
    tx: DbExecutor,
    ctx: ApprovalsContext,
    row: PresentedRow,
    limits: ApprovalLimits,
    now: Date,
  ): Promise<ApprovalDetailDto> {
    const [dto] = await this.present(tx, ctx, [row], limits, now)
    if (dto === undefined) throw new Error('approval was not presented')
    return {
      ...dto,
      payload: row.approval.payload,
      editedPayload: row.approval.editedPayload,
    }
  }

  /** Deciding an AI action needs access to its agent or flow. */
  async canAccessSubject(
    tx: DbExecutor,
    ctx: ApprovalsContext,
    approval: ApprovalRow,
  ): Promise<boolean> {
    if (approval.kind !== 'ai_action' && approval.kind !== 'flow_step') return true
    return this.deps.subjects.canAccess(tx, ctx, approval)
  }
}

const ref = (users: ReadonlyMap<string, UserRefDto>, id: string | null): UserRefDto | null =>
  id === null ? null : (users.get(id) ?? null)

const idName = (id: string | null, names: ReadonlyMap<string, string>) => {
  if (id === null) return null
  const name = names.get(id)
  return name === undefined ? null : { id, name }
}

function toAssigneeDto(
  row: AssigneeRow,
  users: ReadonlyMap<string, UserRefDto>,
  teams: ReadonlyMap<string, TeamRefDto>,
): ApprovalAssigneeDto {
  return {
    subjectType: row.subjectType,
    user: ref(users, row.userId),
    team: row.teamId === null ? null : (teams.get(row.teamId) ?? null),
    role: row.role,
    source: row.source,
  }
}

const compact = <T>(values: readonly (T | null)[]): T[] =>
  values.filter((value): value is T => value !== null)

const unique = <T>(values: readonly T[]): T[] => [...new Set(values)]
