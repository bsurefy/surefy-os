// SPDX-License-Identifier: AGPL-3.0-only
import { sqlState, type Database, type DbExecutor } from '@/core/database/index.js'
import { decodeCursor, toPage } from '@/lib/pagination.js'
import {
  BUDGET_AUDIT_ACTIONS,
  budgetMeterState,
  budgetUsedBp,
  PERMISSIONS,
} from '@surefy/contracts'
import type {
  InsightsBudgetMeterDto,
  InsightsBudgetMeterQuery,
  BudgetDto,
  BudgetMeterDto,
  CreateBudgetInput,
  ListBudgetsQuery,
  TeamRefDto,
  UpdateBudgetInput,
  UserRefDto,
} from '@surefy/contracts'

import {
  BudgetAlreadyExistsError,
  BudgetExceedsParentError,
  BudgetNotFoundError,
  BudgetTargetNotFoundError,
} from './budgets.errors.js'
import { effectiveAmount, periodOf } from './budgets.utils.js'

import type { BudgetEnforcer } from './budgetEnforcement.js'
import type { BudgetPatch, BudgetRow, BudgetsRepository } from './budgets.repository.js'
import type { BudgetsContext, BudgetsOrganizations, BudgetsOutbox } from './budgets.types.js'
import type { UsageTeams, UsageUserRefs } from './usage.types.js'
import type { AuditRecorder } from '@/modules/audit/index.js'

export interface BudgetsServiceDeps {
  db: Database
  repository: BudgetsRepository
  enforcer: BudgetEnforcer
  organizations: BudgetsOrganizations
  teams: UsageTeams
  users: UsageUserRefs
  audit: AuditRecorder
  outbox: () => BudgetsOutbox
  now?: () => Date
}

const UNIQUE_VIOLATION = '23505'

/** A budget row with what its DTO needs that the row does not hold. */
interface BudgetView {
  budget: BudgetRow
  /** Personal limits: the person's primary team. */
  primaryTeamId: string | null
}

/** Everything the DTOs of a set of budgets read inside the transaction. */
interface BudgetRefs {
  teams: Map<string, TeamRefDto>
  alerts: Map<string, { thresholdBp: number; triggeredAt: Date }>
  /** The enabled organization budget, for the effective amounts. */
  organization: BudgetRow | undefined
}

const SETTINGS = ['amountMicros', 'onReached', 'alertThresholdsBp', 'isEnabled'] as const

/** The settings a change touches, for the audit entry. */
const budgetChanges = (before: BudgetRow, after: BudgetRow) =>
  SETTINGS.flatMap((field) =>
    JSON.stringify(before[field]) === JSON.stringify(after[field])
      ? []
      : [{ field, from: before[field], to: after[field] }],
  )

const alreadyExists = (error: unknown): never => {
  if (sqlState(error) === UNIQUE_VIOLATION) throw new BudgetAlreadyExistsError()
  throw error
}

/**
 * Budgets for the organization, a team or one person (usage-budgets-and-audit.md, §2). A team or
 * personal budget never exceeds the enabled organization budget. Every write audits `budget.*`,
 * bumps the organization's access version and emits `budgets.changed` in its transaction.
 */
export class BudgetsService {
  private readonly now: () => Date

  constructor(private readonly deps: BudgetsServiceDeps) {
    this.now = deps.now ?? (() => new Date())
  }

  async list(
    ctx: BudgetsContext,
    query: ListBudgetsQuery,
  ): Promise<{ items: BudgetDto[]; nextCursor: string | null }> {
    const { rows, refs } = await this.deps.db.tenant(ctx.orgId, async (tx) => {
      const found = await this.deps.repository.listPage(tx, ctx.orgId, {
        limit: query.limit,
        ...(query.scope === undefined ? {} : { scopes: query.scope }),
        ...(query.teamId === undefined ? {} : { teamId: query.teamId }),
        ...(query.userId === undefined ? {} : { userId: query.userId }),
        ...(query.q === undefined ? {} : { q: query.q }),
        ...(query.cursor === undefined ? {} : { cursor: decodeCursor(query.cursor) }),
      })
      return { rows: found, refs: await this.refsOf(tx, ctx.orgId, found) }
    })
    const { items, nextCursor } = toPage(rows, query.limit, (row) => ({
      k: row.sortKey,
      id: row.budget.id,
    }))
    return { items: await this.toDtos(ctx.orgId, items, refs), nextCursor }
  }

  /**
   * `GET /insights/budget-meter`: this month's spend against the enabled budget of a team, a
   * person or (without either) the organization; null without one. Readers limited to their own
   * agents (`insights:read-own`) see it restricted.
   */
  async meter(
    ctx: { orgId: string; access: { permissions: readonly string[] } },
    query: InsightsBudgetMeterQuery,
  ): Promise<InsightsBudgetMeterDto> {
    if (!ctx.access.permissions.includes(PERMISSIONS.INSIGHTS_READ)) {
      return { meter: { state: 'restricted' } }
    }
    const { budget, organization } = await this.deps.db.tenant(ctx.orgId, async (tx) => ({
      budget: await this.deps.repository.findByScope(tx, ctx.orgId, query),
      organization: await this.deps.repository.findOrganizationBudget(tx, ctx.orgId),
    }))
    if (budget?.isEnabled !== true) return { meter: { state: 'value', value: null } }
    const parent = organization?.isEnabled === true ? organization : undefined
    return { meter: { state: 'value', value: await this.meterOf(ctx.orgId, budget, parent) } }
  }

  async create(ctx: BudgetsContext, input: CreateBudgetInput): Promise<BudgetDto> {
    const repository = this.deps.repository
    const view = await this.deps.db
      .tenant(ctx.orgId, async (tx) => {
        const organization = await this.deps.organizations.getInTx(tx, ctx.orgId)
        if (organization === undefined) throw new BudgetTargetNotFoundError()
        if (input.scope === 'team') {
          const [team] = await this.deps.teams.findRefsInTx(tx, ctx.orgId, [input.teamId])
          if (team === undefined) throw new BudgetTargetNotFoundError()
        }
        if (
          input.scope === 'user' &&
          !(await repository.isActiveMember(tx, ctx.orgId, input.userId))
        ) {
          throw new BudgetTargetNotFoundError()
        }
        const currency = organization.currency
        if (input.scope !== 'organization' && input.isEnabled) {
          await this.assertWithinParent(tx, ctx.orgId, input.amountMicros, currency)
        }
        const budget = await repository.insert(tx, {
          organizationId: ctx.orgId,
          scope: input.scope,
          teamId: input.scope === 'team' ? input.teamId : null,
          userId: input.scope === 'user' ? input.userId : null,
          amountMicros: input.amountMicros,
          currency,
          onReached: input.onReached,
          alertThresholdsBp: input.alertThresholdsBp,
          isEnabled: input.isEnabled,
          createdByUserId: ctx.userId,
          updatedByUserId: ctx.userId,
        })
        await this.changedInTx(tx, ctx, budget, BUDGET_AUDIT_ACTIONS.BUDGET_CREATED, [])
        return this.viewInTx(tx, ctx.orgId, budget)
      })
      .catch(alreadyExists)
    await this.deps.enforcer.forget(ctx.orgId)
    return this.dtoOf(ctx.orgId, view)
  }

  /**
   * Lowering the organization budget never rewrites the others: their effective amount becomes
   * the minimum. Raising a team or personal budget above it, or enabling one that is, fails.
   */
  async update(
    ctx: BudgetsContext,
    budgetId: string,
    input: UpdateBudgetInput,
  ): Promise<BudgetDto> {
    const repository = this.deps.repository
    const view = await this.deps.db.tenant(ctx.orgId, async (tx) => {
      const current = await repository.findById(tx, ctx.orgId, budgetId)
      if (current === undefined) throw new BudgetNotFoundError()
      const amountMicros = input.amountMicros ?? current.amountMicros
      const isEnabled = input.isEnabled ?? current.isEnabled
      const raises = amountMicros > current.amountMicros || (isEnabled && !current.isEnabled)
      if (current.scope !== 'organization' && isEnabled && raises) {
        await this.assertWithinParent(tx, ctx.orgId, amountMicros, current.currency)
      }
      const patch: BudgetPatch = { updatedByUserId: ctx.userId }
      if (input.amountMicros !== undefined) patch.amountMicros = input.amountMicros
      if (input.onReached !== undefined) patch.onReached = input.onReached
      if (input.alertThresholdsBp !== undefined) patch.alertThresholdsBp = input.alertThresholdsBp
      if (input.isEnabled !== undefined) patch.isEnabled = input.isEnabled
      const updated = await repository.update(tx, ctx.orgId, budgetId, patch)
      if (updated === undefined) throw new BudgetNotFoundError()
      await this.changedInTx(
        tx,
        ctx,
        updated,
        BUDGET_AUDIT_ACTIONS.BUDGET_UPDATED,
        budgetChanges(current, updated),
      )
      return this.viewInTx(tx, ctx.orgId, updated)
    })
    await this.deps.enforcer.forget(ctx.orgId)
    return this.dtoOf(ctx.orgId, view)
  }

  async delete(ctx: BudgetsContext, budgetId: string): Promise<void> {
    await this.deps.db.tenant(ctx.orgId, async (tx) => {
      const current = await this.deps.repository.findById(tx, ctx.orgId, budgetId)
      if (current === undefined) throw new BudgetNotFoundError()
      await this.deps.repository.delete(tx, ctx.orgId, budgetId)
      await this.changedInTx(tx, ctx, current, BUDGET_AUDIT_ACTIONS.BUDGET_DELETED, [])
    })
    await this.deps.enforcer.forget(ctx.orgId)
  }

  // ── Internals ─────────────────────────────────────────────────────────────────────────────────

  /** A team or personal amount above the enabled organization budget fails. */
  private async assertWithinParent(
    tx: DbExecutor,
    orgId: string,
    amountMicros: number,
    currency: string,
  ): Promise<void> {
    const parent = await this.deps.repository.findOrganizationBudget(tx, orgId)
    if (parent?.isEnabled !== true || parent.currency !== currency) return
    if (amountMicros > parent.amountMicros) throw new BudgetExceedsParentError(parent.amountMicros)
  }

  /** Audit, access version and `budgets.changed`, in the write's transaction. */
  private async changedInTx(
    tx: DbExecutor,
    ctx: BudgetsContext,
    budget: BudgetRow,
    action: (typeof BUDGET_AUDIT_ACTIONS)[keyof typeof BUDGET_AUDIT_ACTIONS],
    changes: { field: string; from: unknown; to: unknown }[],
  ): Promise<void> {
    await this.deps.audit.record(tx, ctx, {
      action,
      target: { type: 'budget', id: budget.id },
      metadata: {
        ...(changes.length === 0 ? {} : { changes }),
        labels: { scope: budget.scope, currency: budget.currency },
        refs: {
          ...(budget.teamId === null ? {} : { teamId: budget.teamId }),
          ...(budget.userId === null ? {} : { userId: budget.userId }),
        },
      },
    })
    await this.deps.organizations.bumpAccessVersionInTx(tx, ctx.orgId)
    await this.deps.outbox().write(tx, {
      orgId: ctx.orgId,
      topic: 'budgets.changed',
      payload: { version: 1 },
    })
  }

  private async viewInTx(
    tx: DbExecutor,
    orgId: string,
    budget: BudgetRow,
  ): Promise<{ view: BudgetView; refs: BudgetRefs }> {
    const primaryTeamId =
      budget.userId === null
        ? null
        : await this.deps.repository.primaryTeamOf(tx, orgId, budget.userId)
    const view: BudgetView = { budget, primaryTeamId }
    return { view, refs: await this.refsOf(tx, orgId, [view]) }
  }

  private async dtoOf(
    orgId: string,
    found: { view: BudgetView; refs: BudgetRefs },
  ): Promise<BudgetDto> {
    const [dto] = await this.toDtos(orgId, [found.view], found.refs)
    if (dto === undefined) throw new BudgetNotFoundError()
    return dto
  }

  private async refsOf(
    tx: DbExecutor,
    orgId: string,
    views: readonly BudgetView[],
  ): Promise<BudgetRefs> {
    const teamIds = new Set<string>()
    for (const { budget, primaryTeamId } of views) {
      if (budget.teamId !== null) teamIds.add(budget.teamId)
      if (primaryTeamId !== null) teamIds.add(primaryTeamId)
    }
    const teams = await this.deps.teams.findRefsInTx(tx, orgId, [...teamIds])
    const organization = await this.deps.repository.findOrganizationBudget(tx, orgId)
    return {
      teams: new Map(teams.map((team) => [team.id, team])),
      alerts: await this.deps.repository.lastAlerts(
        tx,
        orgId,
        views.map((view) => view.budget.id),
        periodOf(this.now()).periodStart,
      ),
      organization: organization?.isEnabled === true ? organization : undefined,
    }
  }

  /** The DTOs, with this month's meter from the live counters (outside the transaction). */
  private async toDtos(
    orgId: string,
    views: readonly BudgetView[],
    refs: BudgetRefs,
  ): Promise<BudgetDto[]> {
    const userIds = new Set<string>()
    for (const { budget } of views) {
      if (budget.userId !== null) userIds.add(budget.userId)
      if (budget.updatedByUserId !== null) userIds.add(budget.updatedByUserId)
    }
    const users = await this.deps.users.findUserRefs([...userIds])
    const dtos: BudgetDto[] = []
    for (const view of views) {
      const { budget } = view
      const meter = budget.isEnabled ? await this.meterOf(orgId, budget, refs.organization) : null
      dtos.push(budgetDtoOf(view, refs, users, meter))
    }
    return dtos
  }

  private async meterOf(
    orgId: string,
    budget: BudgetRow,
    organization: BudgetRow | undefined,
  ): Promise<BudgetMeterDto> {
    const at = this.now()
    const { periodStart, periodEnd } = periodOf(at)
    const parent =
      budget.scope === 'organization' || organization?.currency !== budget.currency
        ? null
        : organization.amountMicros
    const effectiveAmountMicros = effectiveAmount(budget.amountMicros, parent)
    const spentMicros = await this.deps.enforcer.spend(orgId, budget, at)
    return {
      budgetId: budget.id,
      scope: budget.scope,
      amountMicros: budget.amountMicros,
      effectiveAmountMicros,
      spentMicros,
      currency: budget.currency,
      usedBp: budgetUsedBp(spentMicros, effectiveAmountMicros),
      state: budgetMeterState(spentMicros, effectiveAmountMicros, budget.alertThresholdsBp),
      onReached: budget.onReached,
      periodStart,
      periodEnd,
    }
  }
}

/** A budget's DTO from its row, the refs read with it and its meter. */
function budgetDtoOf(
  { budget, primaryTeamId }: BudgetView,
  refs: BudgetRefs,
  users: ReadonlyMap<string, UserRefDto>,
  meter: BudgetMeterDto | null,
): BudgetDto {
  const teamRef = (teamId: string | null) =>
    teamId === null ? null : (refs.teams.get(teamId) ?? null)
  const userRef = (userId: string | null) => (userId === null ? null : (users.get(userId) ?? null))
  const alert = refs.alerts.get(budget.id)
  return {
    id: budget.id,
    scope: budget.scope,
    team: teamRef(budget.teamId),
    user: userRef(budget.userId),
    primaryTeam: budget.scope === 'user' ? teamRef(primaryTeamId) : null,
    period: budget.period,
    amountMicros: budget.amountMicros,
    currency: budget.currency,
    onReached: budget.onReached,
    alertThresholdsBp: budget.alertThresholdsBp,
    isEnabled: budget.isEnabled,
    meter,
    lastAlert:
      alert === undefined
        ? null
        : { thresholdBp: alert.thresholdBp, triggeredAt: alert.triggeredAt.toISOString() },
    updatedBy: userRef(budget.updatedByUserId),
    createdAt: budget.createdAt.toISOString(),
    updatedAt: budget.updatedAt.toISOString(),
  }
}
