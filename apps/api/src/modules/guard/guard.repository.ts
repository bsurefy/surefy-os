// SPDX-License-Identifier: AGPL-3.0-only
import { and, asc, eq, gte, inArray, ne, sql } from 'drizzle-orm'

import {
  approvals,
  auditLogs,
  guardrails,
  guardSettings,
  guardStatsDaily,
  organizations,
  piiFilterRules,
} from '@/database/tables/index.js'
import { GUARD_AUDIT_ACTIONS } from '@surefy/contracts'
import type { GuardMatch } from '@surefy/contracts'

import type { ActionCounts } from './guard.types.js'
import type { DbExecutor } from '@/core/database/index.js'

export type GuardSettingsRow = typeof guardSettings.$inferSelect
export type NewGuardSettingsRow = typeof guardSettings.$inferInsert
export type GuardrailRow = typeof guardrails.$inferSelect
export type NewGuardrailRow = typeof guardrails.$inferInsert
export type PiiRuleRow = typeof piiFilterRules.$inferSelect
export type NewPiiRuleRow = typeof piiFilterRules.$inferInsert
export type GuardStatsRow = typeof guardStatsDaily.$inferSelect

/** The statistics of a range, summed. */
export interface GuardStatsTotals {
  auto: number
  doubleCheck: number
  human: number
  blockedLimit: number
  piiMasked: number
  local: number
}

/** `guard_settings`, `guardrails`, `pii_filter_rules` and `guard_stats_daily`. Every tenant query filters by organization even though RLS does too. */
export class GuardRepository {
  // ── guard_settings ───────────────────────────────────────────────────────────────────────────

  /** The organization's currency, which the Guard amounts are in until it saves its own row. */
  async organizationCurrency(tx: DbExecutor, orgId: string): Promise<string> {
    const [row] = await tx
      .select({ currency: organizations.currency })
      .from(organizations)
      .where(eq(organizations.id, orgId))
    return row?.currency ?? 'USD'
  }

  findSettings(tx: DbExecutor, orgId: string) {
    return tx.query.guardSettings.findFirst({ where: eq(guardSettings.organizationId, orgId) })
  }

  async upsertSettings(
    tx: DbExecutor,
    orgId: string,
    values: Omit<NewGuardSettingsRow, 'organizationId'>,
  ): Promise<GuardSettingsRow> {
    const [row] = await tx
      .insert(guardSettings)
      .values({ organizationId: orgId, ...values })
      .onConflictDoUpdate({ target: guardSettings.organizationId, set: values })
      .returning()
    if (row === undefined) throw new Error('guard settings upsert returned no row')
    return row
  }

  // ── guardrails ───────────────────────────────────────────────────────────────────────────────

  async insertGuardrail(tx: DbExecutor, values: NewGuardrailRow): Promise<GuardrailRow> {
    const [row] = await tx.insert(guardrails).values(values).returning()
    if (row === undefined) throw new Error('guardrail insert returned no row')
    return row
  }

  findGuardrail(tx: DbExecutor, orgId: string, guardrailId: string) {
    return tx.query.guardrails.findFirst({
      where: and(eq(guardrails.organizationId, orgId), eq(guardrails.id, guardrailId)),
    })
  }

  /** Every stored guardrail, by name: an organization has a handful, the table filters in memory. */
  listGuardrails(tx: DbExecutor, orgId: string): Promise<GuardrailRow[]> {
    return tx
      .select()
      .from(guardrails)
      .where(eq(guardrails.organizationId, orgId))
      .orderBy(asc(sql`lower(${guardrails.name})`), asc(guardrails.id))
  }

  /** Names of guardrails by id, for the approvals that carry a rule reference. */
  async guardrailNames(
    tx: DbExecutor,
    orgId: string,
    guardrailIds: readonly string[],
  ): Promise<ReadonlyMap<string, string>> {
    if (guardrailIds.length === 0) return new Map()
    const rows = await tx
      .select({ id: guardrails.id, name: guardrails.name })
      .from(guardrails)
      .where(and(eq(guardrails.organizationId, orgId), inArray(guardrails.id, [...guardrailIds])))
    return new Map(rows.map((row) => [row.id, row.name]))
  }

  /** The enabled rules, the set a check evaluates. */
  listEnabledGuardrails(tx: DbExecutor, orgId: string): Promise<GuardrailRow[]> {
    return tx
      .select()
      .from(guardrails)
      .where(and(eq(guardrails.organizationId, orgId), eq(guardrails.isEnabled, true)))
      .orderBy(asc(guardrails.createdAt), asc(guardrails.id))
  }

  async updateGuardrail(
    tx: DbExecutor,
    orgId: string,
    guardrailId: string,
    set: Partial<NewGuardrailRow>,
  ): Promise<GuardrailRow | undefined> {
    const [row] = await tx
      .update(guardrails)
      .set(set)
      .where(and(eq(guardrails.organizationId, orgId), eq(guardrails.id, guardrailId)))
      .returning()
    return row
  }

  async deleteGuardrail(tx: DbExecutor, orgId: string, guardrailId: string): Promise<boolean> {
    const rows = await tx
      .delete(guardrails)
      .where(and(eq(guardrails.organizationId, orgId), eq(guardrails.id, guardrailId)))
      .returning({ id: guardrails.id })
    return rows.length > 0
  }

  /** An enabled blocked action with the same `match`, other than `exceptId` (the oldest first). */
  async findBlockingTwin(
    tx: DbExecutor,
    orgId: string,
    match: GuardMatch,
    exceptId: string | null,
  ): Promise<{ id: string; name: string } | undefined> {
    const [row] = await tx
      .select({ id: guardrails.id, name: guardrails.name })
      .from(guardrails)
      .where(
        and(
          eq(guardrails.organizationId, orgId),
          eq(guardrails.type, 'blocked_action'),
          eq(guardrails.isEnabled, true),
          sql`${guardrails.definition} -> 'match' = ${JSON.stringify(match)}::jsonb`,
          exceptId === null ? undefined : ne(guardrails.id, exceptId),
        ),
      )
      .orderBy(asc(guardrails.createdAt), asc(guardrails.id))
      .limit(1)
    return row
  }

  /** How many enabled blocked actions share their `match` with another one, and the first of them. */
  async conflictSummary(
    tx: DbExecutor,
    orgId: string,
  ): Promise<{ count: number; firstId: string | null }> {
    const result = await tx.execute<{ count: string; first_id: string | null }>(sql`
      with twins as (
        select id, created_at,
               count(*) over (partition by definition -> 'match') as same
        from guardrails
        where organization_id = ${orgId} and type = 'blocked_action' and is_enabled
      )
      select count(*) filter (where same > 1) as count,
             (array_agg(id order by created_at, id) filter (where same > 1))[1] as first_id
      from twins`)
    const row = result.rows[0]
    return { count: Number(row?.count ?? 0), firstId: row?.first_id ?? null }
  }

  /** `guard.rule_triggered` entries per guardrail since `since` ("Triggered this week"). */
  async triggeredCounts(
    tx: DbExecutor,
    orgId: string,
    since: Date,
  ): Promise<ReadonlyMap<string, number>> {
    const rows = await tx
      .select({ targetId: auditLogs.targetId, total: sql<string>`count(*)` })
      .from(auditLogs)
      .where(
        and(
          eq(auditLogs.organizationId, orgId),
          eq(auditLogs.action, GUARD_AUDIT_ACTIONS.GUARD_RULE_TRIGGERED),
          eq(auditLogs.targetType, 'guardrail'),
          gte(auditLogs.createdAt, since),
        ),
      )
      .groupBy(auditLogs.targetId)
    const counts = new Map<string, number>()
    for (const row of rows) if (row.targetId !== null) counts.set(row.targetId, Number(row.total))
    return counts
  }

  // ── pii_filter_rules ─────────────────────────────────────────────────────────────────────────

  async insertPiiRule(tx: DbExecutor, values: NewPiiRuleRow): Promise<PiiRuleRow> {
    const [row] = await tx.insert(piiFilterRules).values(values).returning()
    if (row === undefined) throw new Error('pii rule insert returned no row')
    return row
  }

  findPiiRule(tx: DbExecutor, orgId: string, ruleId: string) {
    return tx.query.piiFilterRules.findFirst({
      where: and(eq(piiFilterRules.organizationId, orgId), eq(piiFilterRules.id, ruleId)),
    })
  }

  listPiiRules(tx: DbExecutor, orgId: string): Promise<PiiRuleRow[]> {
    return tx
      .select()
      .from(piiFilterRules)
      .where(eq(piiFilterRules.organizationId, orgId))
      .orderBy(asc(piiFilterRules.createdAt), asc(piiFilterRules.id))
  }

  async updatePiiRule(
    tx: DbExecutor,
    orgId: string,
    ruleId: string,
    set: Partial<NewPiiRuleRow>,
  ): Promise<PiiRuleRow | undefined> {
    const [row] = await tx
      .update(piiFilterRules)
      .set(set)
      .where(and(eq(piiFilterRules.organizationId, orgId), eq(piiFilterRules.id, ruleId)))
      .returning()
    return row
  }

  async deletePiiRule(tx: DbExecutor, orgId: string, ruleId: string): Promise<boolean> {
    const rows = await tx
      .delete(piiFilterRules)
      .where(and(eq(piiFilterRules.organizationId, orgId), eq(piiFilterRules.id, ruleId)))
      .returning({ id: piiFilterRules.id })
    return rows.length > 0
  }

  // ── Statistics ───────────────────────────────────────────────────────────────────────────────

  /**
   * Rebuilds one UTC day for every organization from the usage events and the approvals; the
   * step counts come from `actions` (the run modules). Delete and insert commit together, so
   * readers see the old or the new rows.
   */
  async recomputeDay(tx: DbExecutor, day: string, actions: readonly ActionCounts[]): Promise<void> {
    const lock = `guard-stats-daily:${day}`
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${lock}))`)
    await tx.delete(guardStatsDaily).where(eq(guardStatsDaily.day, day))
    await tx.execute(sql`
      insert into guard_stats_daily (organization_id, day, pii_masked_requests, local_requests,
        approvals_requested, approvals_approved, approvals_rejected, approvals_expired,
        approval_decision_seconds_sum)
      select organization_id, ${day}::date, sum(pii), sum(local_calls), sum(requested),
             sum(approved), sum(rejected), sum(expired), sum(seconds)
      from (
        select organization_id,
               count(*) filter (where pii_masked) as pii,
               count(*) filter (where data_location = 'local') as local_calls,
               0 as requested, 0 as approved, 0 as rejected, 0 as expired, 0 as seconds
        from usage_events
        where created_at >= (${day}::date::timestamp at time zone 'UTC')
          and created_at < ((${day}::date + 1)::timestamp at time zone 'UTC')
        group by organization_id
        union all
        select organization_id, 0, 0, count(*), 0, 0, 0, 0
        from approvals
        where created_at >= (${day}::date::timestamp at time zone 'UTC')
          and created_at < ((${day}::date + 1)::timestamp at time zone 'UTC')
        group by organization_id
        union all
        select organization_id, 0, 0, 0,
               count(*) filter (where status = 'approved'),
               count(*) filter (where status = 'rejected'),
               count(*) filter (where status = 'expired'),
               coalesce(sum(extract(epoch from decided_at - created_at))
                 filter (where resolved_by = 'user'), 0)::bigint
        from approvals
        where decided_at >= (${day}::date::timestamp at time zone 'UTC')
          and decided_at < ((${day}::date + 1)::timestamp at time zone 'UTC')
        group by organization_id
      ) parts
      group by organization_id`)
    for (const counts of actions) {
      await tx
        .insert(guardStatsDaily)
        .values({
          organizationId: counts.organizationId,
          day,
          actionsAuto: counts.auto,
          actionsDoubleCheck: counts.doubleCheck,
          actionsHuman: counts.human,
          actionsBlockedRule: counts.blockedRule,
          actionsBlockedLimit: counts.blockedLimit,
        })
        .onConflictDoUpdate({
          target: [guardStatsDaily.organizationId, guardStatsDaily.day],
          set: {
            actionsAuto: counts.auto,
            actionsDoubleCheck: counts.doubleCheck,
            actionsHuman: counts.human,
            actionsBlockedRule: counts.blockedRule,
            actionsBlockedLimit: counts.blockedLimit,
          },
        })
    }
  }

  /** The statistics of the days from `fromDay` (inclusive), summed. */
  async totalsSince(tx: DbExecutor, orgId: string, fromDay: string): Promise<GuardStatsTotals> {
    const result = await tx.execute<Record<keyof GuardStatsTotals, string | null>>(sql`
      select coalesce(sum(actions_auto), 0) as auto,
             coalesce(sum(actions_double_check), 0) as "doubleCheck",
             coalesce(sum(actions_human), 0) as human,
             coalesce(sum(actions_blocked_limit), 0) as "blockedLimit",
             coalesce(sum(pii_masked_requests), 0) as "piiMasked",
             coalesce(sum(local_requests), 0) as local
      from guard_stats_daily
      where organization_id = ${orgId} and day >= ${fromDay}::date`)
    const row = result.rows[0]
    return {
      auto: Number(row?.auto ?? 0),
      doubleCheck: Number(row?.doubleCheck ?? 0),
      human: Number(row?.human ?? 0),
      blockedLimit: Number(row?.blockedLimit ?? 0),
      piiMasked: Number(row?.piiMasked ?? 0),
      local: Number(row?.local ?? 0),
    }
  }

  /** Median seconds from request to a person's decision, over approvals decided since `since`. */
  async medianDecisionSeconds(tx: DbExecutor, orgId: string, since: Date): Promise<number | null> {
    const result = await tx.execute<{ median: number | null }>(sql`
      select percentile_cont(0.5) within group (order by extract(epoch from decided_at - created_at))
             as median
      from approvals
      where organization_id = ${orgId} and resolved_by = 'user' and decided_at >= ${since}`)
    const median = result.rows[0]?.median
    return median ?? null
  }

  /** Pending approvals older than `olderThan`, and the oldest. */
  async overdueApprovals(tx: DbExecutor, orgId: string, olderThan: Date): Promise<number> {
    const [row] = await tx
      .select({ total: sql<string>`count(*)` })
      .from(approvals)
      .where(
        and(
          eq(approvals.organizationId, orgId),
          eq(approvals.status, 'pending'),
          sql`${approvals.createdAt} < ${olderThan}`,
        ),
      )
    return Number(row?.total ?? 0)
  }
}
