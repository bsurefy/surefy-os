// SPDX-License-Identifier: AGPL-3.0-only
import { type SQL, sql } from 'drizzle-orm'

import { usageEvents } from '@/database/tables/index.js'
import { uuidv7 } from '@/lib/uuidv7.js'
import type { InsightsFilters, InsightsInterval, UsageEvent } from '@surefy/contracts'

import type { DbExecutor } from '@/core/database/index.js'
import type { UsageRollup } from '@/database/tables/index.js'

/** Which table a read aggregates: raw events (exact instants) or the daily rollup (UTC days). */
export type UsageSource =
  { table: 'events'; from: string; to: string } | { table: 'daily'; fromDay: string; toDay: string }

/** Totals of one group and currency, as Postgres returns them. */
export interface TotalsRow {
  currency: string
  requests: number
  inputTokens: number
  outputTokens: number
  cachedInputTokens: number
  costMicros: number
}

export interface GroupRow extends TotalsRow {
  key: string | null
  isLocal: boolean
}

export interface BucketRow extends Omit<TotalsRow, 'currency'> {
  start: string
  currency: string | null
}

export interface UsageCsvRow {
  day: string
  team: string | null
  person: string | null
  email: string | null
  source: string
  model: string
  provider: string | null
  billedVia: string
  requests: number
  errors: number
  inputTokens: number
  outputTokens: number
  cachedInputTokens: number
  reasoningTokens: number
  costMicros: number
  currency: string
}

const n = (value: unknown): number => Number(value ?? 0)

const list = (values: readonly string[]): SQL =>
  sql.join(
    values.map((value) => sql`${value}`),
    sql`, `,
  )

/** The Insights filters as SQL conditions; the events and daily tables share the column names. */
function filterSql(filters: InsightsFilters): SQL {
  const parts: SQL[] = []
  if (filters.teamId !== undefined) parts.push(sql`and team_id in (${list(filters.teamId)})`)
  if (filters.userId !== undefined) parts.push(sql`and user_id in (${list(filters.userId)})`)
  if (filters.modelKey !== undefined) parts.push(sql`and model_key in (${list(filters.modelKey)})`)
  if (filters.sourceModule !== undefined)
    parts.push(sql`and source_module in (${list(filters.sourceModule)})`)
  return sql.join(parts, sql` `)
}

/**
 * The rows a read aggregates, in one shape: `at` (the event time, or the UTC day's start),
 * `requests`, the token counts, `cost_micros` and `messages` (chat answers generated).
 */
function sourceSql(orgId: string, source: UsageSource, filters: InsightsFilters): SQL {
  if (source.table === 'events') {
    return sql`
      select created_at as at, user_id, team_id, model_key, source_module, billed_via, currency,
             1::bigint as requests, input_tokens, output_tokens, cached_input_tokens, cost_micros,
             (source_module = 'chat' and kind = 'generation' and outcome = 'success')::int as messages
      from usage_events
      where organization_id = ${orgId}
        and created_at >= ${source.from}::timestamptz and created_at < ${source.to}::timestamptz
        ${filterSql(filters)}`
  }
  return sql`
    select (day::timestamp at time zone 'UTC') as at, user_id, team_id, model_key, source_module,
           billed_via, currency, requests, input_tokens, output_tokens, cached_input_tokens,
           cost_micros,
           case when source_module = 'chat' then requests - errors - blocked else 0 end as messages
    from usage_daily
    where organization_id = ${orgId}
      and day >= ${source.fromDay}::date and day < ${source.toDay}::date
      ${filterSql(filters)}`
}

const GROUP_KEYS = {
  team: sql.raw('team_id::text'),
  person: sql.raw('user_id::text'),
  model: sql.raw('model_key'),
} as const

/** `usage_events`, `usage_daily`, `usage_monthly` and `usage_rollup_state`. */
export class UsageRepository {
  // ── Metering ──────────────────────────────────────────────────────────────────────────────────

  /** Inserts one metered call; false when its dedupe key was already recorded. */
  async insertEvent(tx: DbExecutor, orgId: string, event: UsageEvent): Promise<boolean> {
    const rows = await tx
      .insert(usageEvents)
      .values({
        id: uuidv7(),
        organizationId: orgId,
        userId: event.userId,
        teamId: event.teamId,
        apiKeyId: event.apiKeyId,
        sourceModule: event.sourceModule,
        subjectType: event.subjectType,
        subjectId: event.subjectId,
        sourceRefId: event.sourceRefId,
        kind: event.kind,
        modelKey: event.modelKey,
        vaultModelId: event.vaultModelId,
        credentialId: event.credentialId,
        credentialScope: event.credentialScope,
        providerKey: event.providerKey,
        inputTokens: event.inputTokens,
        outputTokens: event.outputTokens,
        cachedInputTokens: event.cachedInputTokens,
        reasoningTokens: event.reasoningTokens,
        units: event.units,
        costMicros: event.costMicros,
        currency: event.currency,
        billedVia: event.billedVia,
        latencyMs: event.latencyMs,
        outcome: event.outcome,
        errorCode: event.errorCode,
        routed: event.routed,
        fallbackFromModelKey: event.fallbackFromModelKey,
        piiMasked: event.piiMasked,
        dataLocation: event.dataLocation,
        dedupeKey: event.dedupeKey,
        requestId: event.requestId,
        createdAt: new Date(event.occurredAt),
      })
      .onConflictDoNothing()
      .returning({ id: usageEvents.id })
    return rows.length > 0
  }

  // ── Rollups (system scope) ────────────────────────────────────────────────────────────────────

  async watermark(tx: DbExecutor, rollup: UsageRollup): Promise<Date | null> {
    const result = await tx.execute<{ watermark: string | null }>(sql`
      select case when watermark = '-infinity' then null else watermark end as watermark
      from usage_rollup_state where rollup = ${rollup}`)
    const value = result.rows[0]?.watermark ?? null
    return value === null ? null : new Date(value)
  }

  /** The UTC day of the oldest event, for the first run. */
  async firstEventDay(tx: DbExecutor): Promise<string | null> {
    const result = await tx.execute<{ day: string | null }>(sql`
      select to_char(min(created_at) at time zone 'UTC', 'YYYY-MM-DD') as day from usage_events`)
    return result.rows[0]?.day ?? null
  }

  /** The state rows exist from the migration; a missing one is created at '-infinity'. */
  private ensureState(tx: DbExecutor, rollups: readonly UsageRollup[]) {
    const rows = sql.join(
      rollups.map((rollup) => sql`(${rollup}, '-infinity'::timestamptz)`),
      sql`, `,
    )
    return tx.execute(
      sql`insert into usage_rollup_state (rollup, watermark) values ${rows} on conflict do nothing`,
    )
  }

  async markStarted(tx: DbExecutor, rollups: readonly UsageRollup[]): Promise<void> {
    await this.ensureState(tx, rollups)
    await tx.execute(sql`
      update usage_rollup_state set last_hourly_started_at = now(), updated_at = now()
      where rollup in (${list(rollups)})`)
  }

  async markFinished(
    tx: DbExecutor,
    rollups: readonly UsageRollup[],
    mode: 'hourly' | 'nightly',
    newWatermark: Date,
  ): Promise<void> {
    await this.ensureState(tx, rollups)
    if (mode === 'hourly') {
      await tx.execute(sql`
        update usage_rollup_state
        set watermark = greatest(watermark, ${newWatermark.toISOString()}::timestamptz),
            last_hourly_finished_at = now(), last_error_code = null, updated_at = now()
        where rollup in (${list(rollups)})`)
      return
    }
    await tx.execute(sql`
      update usage_rollup_state
      set last_nightly_finished_at = now(), last_error_code = null, updated_at = now()
      where rollup in (${list(rollups)})`)
  }

  async markFailed(tx: DbExecutor, rollups: readonly UsageRollup[], code: string): Promise<void> {
    await this.ensureState(tx, rollups)
    await tx.execute(sql`
      update usage_rollup_state set last_error_code = ${code}, updated_at = now()
      where rollup in (${list(rollups)})`)
  }

  /**
   * Rebuilds one UTC day of `usage_daily` from the events. The transaction-scoped lock keeps two
   * runs from rebuilding the same day at once; readers see the old or the new rows, never both.
   */
  async recomputeDay(tx: DbExecutor, day: string): Promise<void> {
    const lock = `usage-daily:${day}`
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${lock}))`)
    await tx.execute(sql`delete from usage_daily where day = ${day}::date`)
    await tx.execute(sql`
      insert into usage_daily (organization_id, day, user_id, team_id, source_module, subject_type,
        subject_id, model_key, credential_id, billed_via, currency, requests, errors, blocked,
        input_tokens, output_tokens, cached_input_tokens, reasoning_tokens, units, cost_micros)
      select organization_id, ${day}::date, user_id, team_id, source_module, subject_type,
             subject_id, model_key, credential_id, billed_via, currency, count(*),
             count(*) filter (where outcome = 'error'), count(*) filter (where outcome = 'blocked'),
             sum(input_tokens), sum(output_tokens), sum(cached_input_tokens),
             sum(reasoning_tokens), sum(units), sum(cost_micros)
      from usage_events
      where created_at >= (${day}::date::timestamp at time zone 'UTC')
        and created_at < ((${day}::date + 1)::timestamp at time zone 'UTC')
      group by organization_id, user_id, team_id, source_module, subject_type, subject_id,
               model_key, credential_id, billed_via, currency`)
  }

  /** Rebuilds one UTC month of `usage_monthly` (organization, team and user rows) from the days. */
  async recomputeMonth(tx: DbExecutor, month: string): Promise<void> {
    const lock = `usage-monthly:${month}`
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${lock}))`)
    await tx.execute(sql`delete from usage_monthly where month = ${month}::date`)
    await tx.execute(sql`
      with days as (
        select * from usage_daily
        where day >= ${month}::date and day < (${month}::date + interval '1 month')
      )
      insert into usage_monthly (organization_id, month, scope, scope_id, currency, requests,
        input_tokens, output_tokens, cost_micros)
      select organization_id, ${month}::date, 'organization', organization_id, currency,
             sum(requests), sum(input_tokens), sum(output_tokens), sum(cost_micros)
      from days group by organization_id, currency
      union all
      select organization_id, ${month}::date, 'team', team_id, currency,
             sum(requests), sum(input_tokens), sum(output_tokens), sum(cost_micros)
      from days where team_id is not null group by organization_id, team_id, currency
      union all
      select organization_id, ${month}::date, 'user', user_id, currency,
             sum(requests), sum(input_tokens), sum(output_tokens), sum(cost_micros)
      from days where user_id is not null group by organization_id, user_id, currency`)
  }

  // ── Insights (tenant scope) ───────────────────────────────────────────────────────────────────

  async hasUsage(tx: DbExecutor, orgId: string): Promise<boolean> {
    const result = await tx.execute<{ found: boolean }>(sql`
      select exists (select 1 from usage_daily where organization_id = ${orgId})
          or exists (select 1 from usage_events where organization_id = ${orgId}) as found`)
    return result.rows[0]?.found === true
  }

  async kpis(
    tx: DbExecutor,
    orgId: string,
    source: UsageSource,
    filters: InsightsFilters,
  ): Promise<{ messages: number; activePeople: number; tokens: number }> {
    const result = await tx.execute<{ messages: string; people: string; tokens: string }>(sql`
      select coalesce(sum(messages), 0) as messages, count(distinct user_id) as people,
             coalesce(sum(input_tokens + output_tokens), 0) as tokens
      from (${sourceSql(orgId, source, filters)}) u`)
    const row = result.rows[0]
    return { messages: n(row?.messages), activePeople: n(row?.people), tokens: n(row?.tokens) }
  }

  /** Cost per currency, leaving out currencies with nothing spent. */
  async cost(
    tx: DbExecutor,
    orgId: string,
    source: UsageSource,
    filters: InsightsFilters,
  ): Promise<{ currency: string; costMicros: number }[]> {
    const result = await tx.execute<{ currency: string; cost: string }>(sql`
      select currency, sum(cost_micros) as cost
      from (${sourceSql(orgId, source, filters)}) u
      group by currency having sum(cost_micros) > 0 order by currency`)
    return result.rows.map((row) => ({ currency: row.currency, costMicros: n(row.cost) }))
  }

  /** Model keys billed by a provider in the range; the service checks their prices. */
  async providerModelKeys(
    tx: DbExecutor,
    orgId: string,
    source: UsageSource,
    filters: InsightsFilters,
  ): Promise<string[]> {
    const result = await tx.execute<{ model_key: string }>(sql`
      select distinct model_key from (${sourceSql(orgId, source, filters)}) u
      where billed_via = 'provider_direct' order by model_key`)
    return result.rows.map((row) => row.model_key)
  }

  /** Totals per group and currency; the service ranks and cuts them. */
  async groups(
    tx: DbExecutor,
    orgId: string,
    source: UsageSource,
    filters: InsightsFilters,
    by: keyof typeof GROUP_KEYS,
  ): Promise<GroupRow[]> {
    const result = await tx.execute<{
      key: string | null
      currency: string
      requests: string
      input_tokens: string
      output_tokens: string
      cached_input_tokens: string
      cost: string
      is_local: boolean
    }>(sql`
      select ${GROUP_KEYS[by]} as key, currency, sum(requests) as requests,
             sum(input_tokens) as input_tokens, sum(output_tokens) as output_tokens,
             sum(cached_input_tokens) as cached_input_tokens, sum(cost_micros) as cost,
             bool_and(billed_via = 'local') as is_local
      from (${sourceSql(orgId, source, filters)}) u
      group by 1, 2`)
    return result.rows.map((row) => ({
      key: row.key,
      currency: row.currency,
      requests: n(row.requests),
      inputTokens: n(row.input_tokens),
      outputTokens: n(row.output_tokens),
      cachedInputTokens: n(row.cached_input_tokens),
      costMicros: n(row.cost),
      isLocal: row.is_local,
    }))
  }

  /**
   * Every bucket from the range start to its end in the time zone, with totals per currency; an
   * empty bucket comes back once with a null currency.
   */
  async buckets(
    tx: DbExecutor,
    orgId: string,
    source: UsageSource,
    filters: InsightsFilters,
    range: { from: string; to: string; timeZone: string; interval: InsightsInterval },
  ): Promise<BucketRow[]> {
    const { interval, timeZone } = range
    const result = await tx.execute<{
      start: string
      currency: string | null
      requests: string | null
      input_tokens: string | null
      output_tokens: string | null
      cached_input_tokens: string | null
      cost: string | null
    }>(sql`
      with b as (
        select g as start
        from generate_series(
          date_trunc(${interval}, ${range.from}::timestamptz, ${timeZone}),
          ${range.to}::timestamptz - interval '1 microsecond',
          ('1 ' || ${interval})::interval,
          ${timeZone}) g
      ),
      a as (
        select date_trunc(${interval}, at, ${timeZone}) as start, currency,
               sum(requests) as requests, sum(input_tokens) as input_tokens,
               sum(output_tokens) as output_tokens, sum(cached_input_tokens) as cached_input_tokens,
               sum(cost_micros) as cost
        from (${sourceSql(orgId, source, filters)}) u
        group by 1, 2
      )
      select to_char(b.start at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as start,
             a.currency, a.requests, a.input_tokens, a.output_tokens, a.cached_input_tokens, a.cost
      from b left join a on a.start = b.start
      order by b.start, a.currency`)
    return result.rows.map((row) => ({
      start: row.start,
      currency: row.currency,
      requests: n(row.requests),
      inputTokens: n(row.input_tokens),
      outputTokens: n(row.output_tokens),
      cachedInputTokens: n(row.cached_input_tokens),
      costMicros: n(row.cost),
    }))
  }

  // ── Vault and exports (tenant scope) ──────────────────────────────────────────────────────────

  /** Spend this UTC month per key and currency, from the daily rollup. */
  async spendByCredential(
    tx: DbExecutor,
    orgId: string,
    credentialIds: readonly string[],
  ): Promise<{ credentialId: string; currency: string; costMicros: number }[]> {
    if (credentialIds.length === 0) return []
    const result = await tx.execute<{ credential_id: string; currency: string; cost: string }>(sql`
      select credential_id, currency, sum(cost_micros) as cost
      from usage_daily
      where organization_id = ${orgId} and credential_id in (${list(credentialIds)})
        and day >= date_trunc('month', now() at time zone 'UTC')::date
      group by credential_id, currency order by credential_id, currency`)
    return result.rows.map((row) => ({
      credentialId: row.credential_id,
      currency: row.currency,
      costMicros: n(row.cost),
    }))
  }

  /** People who used a key this UTC month. */
  async usersOfCredential(tx: DbExecutor, orgId: string, credentialId: string): Promise<number> {
    const result = await tx.execute<{ people: string }>(sql`
      select count(distinct user_id) as people
      from usage_daily
      where organization_id = ${orgId} and credential_id = ${credentialId}
        and day >= date_trunc('month', now() at time zone 'UTC')::date`)
    return n(result.rows[0]?.people)
  }

  /** The `usage_csv` rows: the daily grain with names resolved, oldest day first. */
  async csvRows(
    tx: DbExecutor,
    orgId: string,
    days: { fromDay: string; toDay: string } | null,
    filters: InsightsFilters,
  ): Promise<UsageCsvRow[]> {
    const range =
      days === null
        ? sql``
        : sql`and d.day >= ${days.fromDay}::date and d.day < ${days.toDay}::date`
    const result = await tx.execute<{
      day: string
      team: string | null
      person: string | null
      email: string | null
      source: string
      model: string
      provider: string | null
      billed_via: string
      requests: string
      errors: string
      input_tokens: string
      output_tokens: string
      cached_input_tokens: string
      reasoning_tokens: string
      cost: string
      currency: string
    }>(sql`
      select to_char(d.day, 'YYYY-MM-DD') as day, t.name as team, u.name as person,
             u.email, d.source_module as source, coalesce(m.display_name, d.model_key) as model,
             m.provider_key as provider, d.billed_via, d.requests, d.errors, d.input_tokens,
             d.output_tokens, d.cached_input_tokens, d.reasoning_tokens, d.cost_micros as cost,
             d.currency
      from (select * from usage_daily where organization_id = ${orgId} ${filterSql(filters)}) d
      left join teams t on t.organization_id = d.organization_id and t.id = d.team_id
      left join users u on u.id = d.user_id
      left join vault_models m on m.organization_id = d.organization_id and m.model_key = d.model_key
      where true ${range}
      order by d.day, t.name nulls last, u.name nulls last, model, d.currency`)
    return result.rows.map((row) => ({
      day: row.day,
      team: row.team,
      person: row.person,
      email: row.email,
      source: row.source,
      model: row.model,
      provider: row.provider,
      billedVia: row.billed_via,
      requests: n(row.requests),
      errors: n(row.errors),
      inputTokens: n(row.input_tokens),
      outputTokens: n(row.output_tokens),
      cachedInputTokens: n(row.cached_input_tokens),
      reasoningTokens: n(row.reasoning_tokens),
      costMicros: n(row.cost),
      currency: row.currency,
    }))
  }
}
