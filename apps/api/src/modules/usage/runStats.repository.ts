// SPDX-License-Identifier: AGPL-3.0-only
import { sql } from 'drizzle-orm'

import type { DbExecutor } from '@/core/database/index.js'

/**
 * `run_stats_daily` (usage-budgets-and-audit.md, §8), rebuilt one UTC day at a time under system
 * scope by the rollup. `agent_runs` and `agent_run_steps` belong to the agentRuns module: these are
 * read-only aggregations. Flows join with their V2 module.
 */
export class RunStatsRepository {
  /** The UTC day of the oldest finished non-test run, for the first run. */
  async firstRunDay(tx: DbExecutor): Promise<string | null> {
    const result = await tx.execute<{ day: string | null }>(sql`
      select to_char(min(finished_at) at time zone 'UTC', 'YYYY-MM-DD') as day
      from agent_runs where finished_at is not null and is_test = false`)
    return result.rows[0]?.day ?? null
  }

  /**
   * Deletes the day and inserts one row per organization, agent and currency from the non-test
   * runs that finished that day, with their Guard-checked steps counted by band. Runs inside the
   * caller's transaction, which holds the day's advisory lock.
   */
  async recomputeDay(tx: DbExecutor, day: string): Promise<void> {
    await tx.execute(sql`delete from run_stats_daily where day = ${day}::date`)
    await tx.execute(sql`
      with runs as (
        select organization_id, id, agent_id, currency, status, needed_human, human_corrected,
               duration_ms, cost_micros, created_at
        from agent_runs
        where is_test = false
          and finished_at >= (${day}::date::timestamp at time zone 'UTC')
          and finished_at < ((${day}::date + 1)::timestamp at time zone 'UTC')
      ),
      bands as (
        -- steps are partitioned by created_at: a step is never older than its run
        select s.run_id,
               count(*) filter (where s.guard_band = 'auto') as auto,
               count(*) filter (where s.guard_band = 'double_check') as double_check,
               count(*) filter (where s.guard_band = 'human') as human,
               count(*) filter (where s.guard_band = 'blocked') as blocked
        from agent_run_steps s
        join runs r
          on s.organization_id = r.organization_id and s.run_id = r.id
         and s.created_at >= r.created_at
        where s.guard_band is not null
        group by s.run_id
      )
      insert into run_stats_daily (organization_id, day, subject_type, subject_id, currency,
        runs_total, runs_succeeded, runs_succeeded_uncorrected, runs_failed, runs_timed_out,
        runs_canceled, runs_needed_human, runs_human_corrected, actions_auto,
        actions_double_check, actions_human, actions_blocked, duration_ms_sum, cost_micros)
      select r.organization_id, ${day}::date, 'agent', r.agent_id, r.currency,
             count(*),
             count(*) filter (where r.status = 'succeeded'),
             count(*) filter (where r.status = 'succeeded' and not r.human_corrected),
             count(*) filter (where r.status = 'failed'),
             count(*) filter (where r.status = 'timed_out'),
             count(*) filter (where r.status = 'canceled'),
             count(*) filter (where r.needed_human),
             count(*) filter (where r.human_corrected),
             coalesce(sum(b.auto), 0), coalesce(sum(b.double_check), 0),
             coalesce(sum(b.human), 0), coalesce(sum(b.blocked), 0),
             coalesce(sum(r.duration_ms), 0), coalesce(sum(r.cost_micros), 0)
      from runs r
      left join bands b on b.run_id = r.id
      group by r.organization_id, r.agent_id, r.currency`)
  }
}
