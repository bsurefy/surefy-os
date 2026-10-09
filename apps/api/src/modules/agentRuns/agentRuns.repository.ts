// SPDX-License-Identifier: AGPL-3.0-only
import { and, asc, eq, gte, inArray, isNull, lt, lte, or, sql } from 'drizzle-orm'

import { agentRuns } from '@/database/tables/agentRuns.tables.js'
import { agentRunSteps } from '@/database/tables/partitioned/agentRuns.tables.js'
import type { AgentRunStatus, AgentRunSummary } from '@surefy/contracts'

import type { NewRunRow, NewStepRow, RunRow, StepRow } from './agentRuns.types.js'
import type { DbExecutor } from '@/core/database/index.js'

const r = agentRuns
const s = agentRunSteps

/** The statuses of a run that has not ended. */
export const OPEN_STATUSES = [
  'queued',
  'running',
  'waiting_approval',
] as const satisfies readonly AgentRunStatus[]

/** What one persisted step adds to its run's counters. */
export interface StepEffects {
  inputTokens?: number
  outputTokens?: number
  costMicros?: number
  /** Lowers `min_confidence` when smaller. */
  confidence?: number | null
  /** The main model, once a model call answered. */
  modelKey?: string | null
  neededHuman?: boolean
  humanCorrected?: boolean
}

export interface FinishValues {
  status: Extract<AgentRunStatus, 'succeeded' | 'failed' | 'canceled' | 'timed_out'>
  errorCode: string | null
  summary: AgentRunSummary | null
}

/** Rows of `agent_runs` and `agent_run_steps`. Every method takes the caller's tenant transaction. */
export class AgentRunsRepository {
  // ---- Runs ---------------------------------------------------------------------------------

  async insertRun(tx: DbExecutor, values: NewRunRow): Promise<RunRow> {
    const [row] = await tx.insert(r).values(values).returning()
    if (row === undefined) throw new Error('agent run insert returned no row')
    return row
  }

  async findRun(tx: DbExecutor, orgId: string, runId: string): Promise<RunRow | undefined> {
    const [row] = await tx
      .select()
      .from(r)
      .where(and(eq(r.organizationId, orgId), eq(r.id, runId)))
      .limit(1)
    return row
  }

  /** Locks the run row for the claim; undefined when another executor holds it. */
  async lockRun(tx: DbExecutor, orgId: string, runId: string): Promise<RunRow | undefined> {
    const [row] = await tx
      .select()
      .from(r)
      .where(and(eq(r.organizationId, orgId), eq(r.id, runId)))
      .limit(1)
      .for('update', { skipLocked: true })
    return row
  }

  /**
   * `queued` or `running` to `running`; `started_at` the first time. The caller decides whether
   * a `running` run may be taken (a stale heartbeat, or a resume).
   */
  async markRunning(tx: DbExecutor, orgId: string, runId: string): Promise<RunRow | undefined> {
    const [row] = await tx
      .update(r)
      .set({
        status: 'running',
        startedAt: sql`coalesce(${r.startedAt}, now())`,
        updatedAt: new Date(),
      })
      .where(
        and(eq(r.organizationId, orgId), eq(r.id, runId), inArray(r.status, ['queued', 'running'])),
      )
      .returning()
    return row
  }

  /** The heartbeat: refreshes `updated_at` while running and says whether the run still is. */
  async heartbeat(tx: DbExecutor, orgId: string, runId: string): Promise<AgentRunStatus | null> {
    const [touched] = await tx
      .update(r)
      .set({ updatedAt: new Date() })
      .where(and(eq(r.organizationId, orgId), eq(r.id, runId), eq(r.status, 'running')))
      .returning({ status: r.status })
    if (touched !== undefined) return touched.status
    const run = await this.findRun(tx, orgId, runId)
    return run?.status ?? null
  }

  /** `from` to `waiting_approval`, with `needed_human` set. */
  async markWaiting(tx: DbExecutor, orgId: string, runId: string): Promise<boolean> {
    const rows = await tx
      .update(r)
      .set({ status: 'waiting_approval', neededHuman: true, updatedAt: new Date() })
      .where(and(eq(r.organizationId, orgId), eq(r.id, runId), eq(r.status, 'running')))
      .returning({ id: r.id })
    return rows.length > 0
  }

  /** `waiting_approval` to `running`: only the caller that gets the row enqueues the executor. */
  async resume(tx: DbExecutor, orgId: string, runId: string): Promise<RunRow | undefined> {
    const [row] = await tx
      .update(r)
      .set({ status: 'running', updatedAt: new Date() })
      .where(and(eq(r.organizationId, orgId), eq(r.id, runId), eq(r.status, 'waiting_approval')))
      .returning()
    return row
  }

  /** Ends an open run; undefined when it already ended (another caller got there first). */
  async finish(
    tx: DbExecutor,
    orgId: string,
    runId: string,
    from: readonly AgentRunStatus[],
    values: FinishValues,
  ): Promise<RunRow | undefined> {
    const [row] = await tx
      .update(r)
      .set({
        status: values.status,
        errorCode: values.errorCode,
        summary: values.summary,
        finishedAt: sql`now()`,
        durationMs: sql`(extract(epoch from (now() - coalesce(${r.startedAt}, ${r.createdAt}))) * 1000)::int`,
        updatedAt: new Date(),
      })
      .where(and(eq(r.organizationId, orgId), eq(r.id, runId), inArray(r.status, [...from])))
      .returning()
    return row
  }

  /** Runs counted against `maxRunsPerMonth`: every trigger, tests included. */
  async countSince(tx: DbExecutor, orgId: string, since: Date): Promise<number> {
    const [row] = await tx
      .select({ count: sql<number>`count(*)`.mapWith(Number) })
      .from(r)
      .where(and(eq(r.organizationId, orgId), gte(r.createdAt, since)))
    return row?.count ?? 0
  }

  /** Serializes the starts of one organization, so the run limit cannot be passed by a race. */
  async lockStarts(tx: DbExecutor, orgId: string): Promise<void> {
    const key = `agent_run_starts:${orgId}`
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${key}, 0))`)
  }

  // ---- Steps --------------------------------------------------------------------------------

  /**
   * Appends one step. The counters update comes first and is conditional on the run still being
   * `running` at exactly the step the caller read (`expectedSeq - 1`), so a cancel, a timeout or a
   * second executor makes it return false and nothing is written.
   */
  async appendStep(
    tx: DbExecutor,
    orgId: string,
    runId: string,
    step: Omit<NewStepRow, 'organizationId' | 'runId'>,
    effects: StepEffects,
    options: { requireRunning: boolean } = { requireRunning: true },
  ): Promise<StepRow | undefined> {
    const seq = step.seq
    const statusFilter = options.requireRunning
      ? eq(r.status, 'running')
      : inArray(r.status, [...OPEN_STATUSES])
    const rows = await tx
      .update(r)
      .set({
        stepCount: sql`${r.stepCount} + 1`,
        inputTokens: sql`${r.inputTokens} + ${effects.inputTokens ?? 0}`,
        outputTokens: sql`${r.outputTokens} + ${effects.outputTokens ?? 0}`,
        costMicros: sql`${r.costMicros} + ${effects.costMicros ?? 0}`,
        ...(effects.confidence === undefined || effects.confidence === null
          ? {}
          : { minConfidence: sql`least(coalesce(${r.minConfidence}, 1), ${effects.confidence})` }),
        ...(effects.modelKey === undefined || effects.modelKey === null
          ? {}
          : { modelKey: effects.modelKey }),
        ...(effects.neededHuman === true ? { neededHuman: true } : {}),
        ...(effects.humanCorrected === true ? { humanCorrected: true } : {}),
        updatedAt: new Date(),
      })
      .where(
        and(eq(r.organizationId, orgId), eq(r.id, runId), eq(r.stepCount, seq - 1), statusFilter),
      )
      .returning({ id: r.id })
    if (rows.length === 0) return undefined
    const [stored] = await tx
      .insert(s)
      .values({ ...step, organizationId: orgId, runId })
      .returning()
    return stored
  }

  /** The steps of a run in order. Reads are bounded to the run's window, so only its partitions are scanned. */
  async listSteps(tx: DbExecutor, orgId: string, run: RunRow): Promise<StepRow[]> {
    return tx
      .select()
      .from(s)
      .where(
        and(
          eq(s.organizationId, orgId),
          eq(s.runId, run.id),
          gte(s.createdAt, run.createdAt),
          run.finishedAt === null ? undefined : lte(s.createdAt, run.finishedAt),
        ),
      )
      .orderBy(asc(s.seq))
  }

  // ---- Sweeper (system scope) ---------------------------------------------------------------

  /** `queued` runs created before `before` and `running` runs whose heartbeat is older than `staleBefore`. */
  async stuck(
    tx: DbExecutor,
    queuedBefore: Date,
    staleBefore: Date,
    limit: number,
  ): Promise<{ id: string; organizationId: string; status: AgentRunStatus }[]> {
    return tx
      .select({ id: r.id, organizationId: r.organizationId, status: r.status })
      .from(r)
      .where(
        or(
          and(eq(r.status, 'queued'), lt(r.updatedAt, queuedBefore)),
          and(eq(r.status, 'running'), lt(r.updatedAt, staleBefore)),
        ),
      )
      .orderBy(asc(r.updatedAt))
      .limit(limit)
  }

  /** `waiting_approval` runs, oldest first: the sweeper looks for lost resume events among them. */
  async waiting(tx: DbExecutor, limit: number): Promise<{ id: string; organizationId: string }[]> {
    return tx
      .select({ id: r.id, organizationId: r.organizationId })
      .from(r)
      .where(eq(r.status, 'waiting_approval'))
      .orderBy(asc(r.updatedAt))
      .limit(limit)
  }

  /** `running` runs that started their stretch before `before` (the caller refines by approvals). */
  async runningSince(
    tx: DbExecutor,
    before: Date,
    limit: number,
  ): Promise<{ id: string; organizationId: string; startedAt: Date | null }[]> {
    return tx
      .select({ id: r.id, organizationId: r.organizationId, startedAt: r.startedAt })
      .from(r)
      .where(and(eq(r.status, 'running'), or(isNull(r.startedAt), lt(r.startedAt, before))))
      .orderBy(asc(r.updatedAt))
      .limit(limit)
  }
}
