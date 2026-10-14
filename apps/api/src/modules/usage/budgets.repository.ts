// SPDX-License-Identifier: AGPL-3.0-only
import { and, eq, inArray, or, sql, type SQL } from 'drizzle-orm'

import {
  budgetAlerts,
  budgets,
  organizationMembers,
  teams,
  users,
} from '@/database/tables/index.js'
import { keysetAfter, keysetOrder, type KeysetCursor, type KeysetSort } from '@/lib/pagination.js'
import type { BudgetScope } from '@surefy/contracts'

import type { DbExecutor } from '@/core/database/index.js'

export type BudgetRow = typeof budgets.$inferSelect
export type NewBudgetRow = typeof budgets.$inferInsert
export type BudgetPatch = Partial<
  Pick<NewBudgetRow, 'amountMicros' | 'onReached' | 'alertThresholdsBp' | 'isEnabled'>
> & { updatedByUserId: string | null }
export type NewBudgetAlertRow = typeof budgetAlerts.$inferInsert

export interface BudgetPageParams {
  limit: number
  cursor?: KeysetCursor
  scopes?: readonly BudgetScope[]
  teamId?: string
  userId?: string
  q?: string
}

/** A budget with the spend scope it counts: the organization, team or person id. */
export interface ReconcileRow {
  budget: BudgetRow
  /** This month's authoritative spend from `usage_monthly`. */
  spentMicros: number
  /** The enabled organization budget in the same currency, for the effective amount. */
  organizationAmountMicros: number | null
}

/** Escapes `%`, `_` and `\` so a search term matches literally. */
const likeTerm = (q: string): string => `%${q.replaceAll(/[\\%_]/g, (c) => '\\' + c)}%`

/** The organization budget first, then teams by name, then people by name. */
export const BUDGET_SORT: KeysetSort = {
  expression: sql`(case ${budgets.scope} when 'organization' then '0' when 'team' then '1' else '2' end
    || lower(coalesce(${teams.name}, ${users.name}, '')))`,
  cast: 'text',
  descending: false,
}

/** The id a budget's spend is counted under: the organization, team or person. */
export const scopeIdOf = (budget: Pick<BudgetRow, 'organizationId' | 'teamId' | 'userId'>) =>
  budget.teamId ?? budget.userId ?? budget.organizationId

const n = (value: string | number | null | undefined): number => Number(value ?? 0)

/** `usage_daily` or `usage_events` rows of one budget scope. */
function scopeFilter(scope: BudgetScope, scopeId: string): SQL {
  if (scope === 'team') return sql`team_id = ${scopeId}`
  if (scope === 'user') return sql`user_id = ${scopeId}`
  return sql`true`
}

/**
 * `budgets` and `budget_alerts`. Every query filters by organization even though RLS does too.
 * Reads of `teams`, `users` and `organization_members` are read-only joins for names, search,
 * primary teams and alert recipients; `usage_daily`, `usage_events` and `usage_monthly` are this
 * module's own.
 */
export class BudgetsRepository {
  async insert(tx: DbExecutor, values: NewBudgetRow): Promise<BudgetRow> {
    const [row] = await tx.insert(budgets).values(values).returning()
    if (row === undefined) throw new Error('budget insert returned no row')
    return row
  }

  async update(
    tx: DbExecutor,
    orgId: string,
    budgetId: string,
    patch: BudgetPatch,
  ): Promise<BudgetRow | undefined> {
    const [row] = await tx
      .update(budgets)
      .set(patch)
      .where(and(eq(budgets.organizationId, orgId), eq(budgets.id, budgetId)))
      .returning()
    return row
  }

  async delete(tx: DbExecutor, orgId: string, budgetId: string): Promise<boolean> {
    const rows = await tx
      .delete(budgets)
      .where(and(eq(budgets.organizationId, orgId), eq(budgets.id, budgetId)))
      .returning({ id: budgets.id })
    return rows.length > 0
  }

  findById(tx: DbExecutor, orgId: string, budgetId: string) {
    return tx.query.budgets.findFirst({
      where: and(eq(budgets.organizationId, orgId), eq(budgets.id, budgetId)),
    })
  }

  findOrganizationBudget(tx: DbExecutor, orgId: string) {
    return tx.query.budgets.findFirst({
      where: and(eq(budgets.organizationId, orgId), eq(budgets.scope, 'organization')),
    })
  }

  /** The budget of one scope: the organization's, a team's or a person's. */
  findByScope(tx: DbExecutor, orgId: string, target: { teamId?: string; userId?: string }) {
    let scope = eq(budgets.scope, 'organization')
    if (target.teamId !== undefined) scope = eq(budgets.teamId, target.teamId)
    else if (target.userId !== undefined) scope = eq(budgets.userId, target.userId)
    return tx.query.budgets.findFirst({ where: and(eq(budgets.organizationId, orgId), scope) })
  }

  /** Team and personal budgets above an amount, for the error when one exceeds its parent. */
  async childrenAbove(tx: DbExecutor, orgId: string, amountMicros: number): Promise<number> {
    const [row] = await tx
      .select({ count: sql<string>`count(*)` })
      .from(budgets)
      .where(
        and(
          eq(budgets.organizationId, orgId),
          sql`${budgets.scope} <> 'organization'`,
          sql`${budgets.amountMicros} > ${amountMicros}`,
        ),
      )
    return n(row?.count)
  }

  /** The enabled budgets of an organization: what the gateway checks (cached). */
  listEnabled(tx: DbExecutor, orgId: string): Promise<BudgetRow[]> {
    return tx
      .select()
      .from(budgets)
      .where(and(eq(budgets.organizationId, orgId), eq(budgets.isEnabled, true)))
  }

  async listPage(tx: DbExecutor, orgId: string, page: BudgetPageParams) {
    const search =
      page.q === undefined
        ? undefined
        : or(
            sql`${teams.name} ilike ${likeTerm(page.q)}`,
            sql`${users.name} ilike ${likeTerm(page.q)}`,
            sql`${users.email} ilike ${likeTerm(page.q)}`,
          )
    return (
      tx
        .select({
          budget: budgets,
          primaryTeamId: organizationMembers.primaryTeamId,
          sortKey: sql<string>`${BUDGET_SORT.expression}::text`,
        })
        .from(budgets)
        // read-only joins: the team and person names to sort and search by, the primary team
        .leftJoin(
          teams,
          and(eq(teams.organizationId, budgets.organizationId), eq(teams.id, budgets.teamId)),
        )
        .leftJoin(users, eq(users.id, budgets.userId))
        .leftJoin(
          organizationMembers,
          and(
            eq(organizationMembers.organizationId, budgets.organizationId),
            eq(organizationMembers.userId, budgets.userId),
          ),
        )
        .where(
          and(
            eq(budgets.organizationId, orgId),
            page.scopes === undefined || page.scopes.length === 0
              ? undefined
              : inArray(budgets.scope, [...page.scopes]),
            page.teamId === undefined ? undefined : eq(budgets.teamId, page.teamId),
            page.userId === undefined ? undefined : eq(budgets.userId, page.userId),
            search,
            keysetAfter(BUDGET_SORT, budgets.id, page.cursor),
          ),
        )
        .orderBy(...keysetOrder(BUDGET_SORT, budgets.id))
        .limit(page.limit + 1)
    )
  }

  /** The primary team of a person in the organization; null without one or when not a member. */
  async primaryTeamOf(tx: DbExecutor, orgId: string, userId: string): Promise<string | null> {
    // read-only: organization_members belongs to the members module
    const [row] = await tx
      .select({ primaryTeamId: organizationMembers.primaryTeamId })
      .from(organizationMembers)
      .where(
        and(eq(organizationMembers.organizationId, orgId), eq(organizationMembers.userId, userId)),
      )
    return row?.primaryTeamId ?? null
  }

  /** Whether the person is an active member: personal limits are only for them. */
  async isActiveMember(tx: DbExecutor, orgId: string, userId: string): Promise<boolean> {
    // read-only: organization_members belongs to the members module
    const [row] = await tx
      .select({ userId: organizationMembers.userId })
      .from(organizationMembers)
      .where(
        and(
          eq(organizationMembers.organizationId, orgId),
          eq(organizationMembers.userId, userId),
          eq(organizationMembers.status, 'active'),
        ),
      )
    return row !== undefined
  }

  /** The highest threshold crossed this period, per budget. */
  async lastAlerts(
    tx: DbExecutor,
    orgId: string,
    budgetIds: readonly string[],
    periodStart: string,
  ): Promise<Map<string, { thresholdBp: number; triggeredAt: Date }>> {
    if (budgetIds.length === 0) return new Map()
    const rows = await tx
      .selectDistinctOn([budgetAlerts.budgetId], {
        budgetId: budgetAlerts.budgetId,
        thresholdBp: budgetAlerts.thresholdBp,
        triggeredAt: budgetAlerts.triggeredAt,
      })
      .from(budgetAlerts)
      .where(
        and(
          eq(budgetAlerts.organizationId, orgId),
          inArray(budgetAlerts.budgetId, [...budgetIds]),
          eq(budgetAlerts.periodStart, periodStart),
        ),
      )
      .orderBy(budgetAlerts.budgetId, sql`${budgetAlerts.thresholdBp} desc`)
    return new Map(rows.map((row) => [row.budgetId, row]))
  }

  /**
   * This month's spend of one budget scope in one currency: the days before today from
   * `usage_daily`, today from `usage_events` (live budget enforcement, step 2).
   */
  async spendThisMonth(
    tx: DbExecutor,
    orgId: string,
    scope: BudgetScope,
    scopeId: string,
    currency: string,
    monthStart: string,
    today: string,
  ): Promise<number> {
    const filter = scopeFilter(scope, scopeId)
    const result = await tx.execute<{ spent: string }>(sql`
      select
        coalesce((select sum(cost_micros) from usage_daily
          where organization_id = ${orgId} and currency = ${currency} and ${filter}
            and day >= ${monthStart}::date and day < ${today}::date), 0)
        + coalesce((select sum(cost_micros) from usage_events
          where organization_id = ${orgId} and currency = ${currency} and ${filter}
            and created_at >= (${today}::date::timestamp at time zone 'UTC')), 0) as spent`)
    return n(result.rows[0]?.spent)
  }

  findAlert(tx: DbExecutor, orgId: string, alertId: string) {
    return tx.query.budgetAlerts.findFirst({
      where: and(eq(budgetAlerts.organizationId, orgId), eq(budgetAlerts.id, alertId)),
    })
  }

  /** One alert per budget, period and threshold; undefined when it already fired. */
  async insertAlert(tx: DbExecutor, values: NewBudgetAlertRow) {
    const [row] = await tx.insert(budgetAlerts).values(values).onConflictDoNothing().returning()
    return row
  }

  /**
   * Who hears about a crossed threshold: the active Admins and Owners, the team lead for a team
   * budget, and the person for a personal limit.
   */
  async alertRecipients(tx: DbExecutor, orgId: string, budget: BudgetRow): Promise<string[]> {
    // read-only: organization_members and teams belong to the members and teams modules
    const om = organizationMembers
    const managers = await tx
      .select({ userId: om.userId })
      .from(om)
      .where(
        and(
          eq(om.organizationId, orgId),
          eq(om.status, 'active'),
          inArray(om.role, ['admin', 'owner']),
        ),
      )
    const ids = new Set(managers.map((row) => row.userId))
    if (budget.teamId !== null) {
      const [team] = await tx
        .select({ leadUserId: teams.leadUserId })
        .from(teams)
        .where(and(eq(teams.organizationId, orgId), eq(teams.id, budget.teamId)))
      if (team?.leadUserId != null) ids.add(team.leadUserId)
    }
    if (budget.userId !== null && (await this.isActiveMember(tx, orgId, budget.userId))) {
      ids.add(budget.userId)
    }
    return [...ids]
  }

  /** The team or person name for a notification; null for the organization. */
  async scopeLabel(tx: DbExecutor, orgId: string, budget: BudgetRow): Promise<string | null> {
    if (budget.teamId !== null) {
      const [team] = await tx
        .select({ name: teams.name })
        .from(teams)
        .where(and(eq(teams.organizationId, orgId), eq(teams.id, budget.teamId)))
      return team?.name ?? null
    }
    if (budget.userId !== null) {
      const [user] = await tx
        .select({ name: users.name })
        .from(users)
        .where(eq(users.id, budget.userId))
      return user?.name ?? null
    }
    return null
  }

  // ── Reconciliation (system scope) ─────────────────────────────────────────────────────────────

  /**
   * Every enabled budget of every organization with this month's spend from `usage_monthly` and
   * the enabled organization budget in its currency.
   */
  async reconcileRows(tx: DbExecutor, month: string): Promise<ReconcileRow[]> {
    const result = await tx.execute<{
      id: string
      spent: string
      organization_amount: string | null
    }>(sql`
      select b.id, coalesce(m.cost_micros, 0) as spent, o.amount_micros as organization_amount
      from budgets b
      left join usage_monthly m
        on m.organization_id = b.organization_id and m.month = ${month}::date
        and m.currency = b.currency and m.scope = b.scope
        and m.scope_id = coalesce(b.team_id, b.user_id, b.organization_id)
      left join budgets o
        on o.organization_id = b.organization_id and o.scope = 'organization'
        and o.is_enabled and o.currency = b.currency
      where b.is_enabled`)
    if (result.rows.length === 0) return []
    const rows = await tx
      .select()
      .from(budgets)
      .where(
        inArray(
          budgets.id,
          result.rows.map((row) => row.id),
        ),
      )
    const byId = new Map(rows.map((row) => [row.id, row]))
    return result.rows.flatMap((row) => {
      const budget = byId.get(row.id)
      if (budget === undefined) return []
      return [
        {
          budget,
          spentMicros: n(row.spent),
          organizationAmountMicros:
            row.organization_amount === null ? null : n(row.organization_amount),
        },
      ]
    })
  }
}
