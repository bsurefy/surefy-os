// SPDX-License-Identifier: AGPL-3.0-only
import { and, asc, eq, gte, ilike, inArray, lte, or, sql } from 'drizzle-orm'

import { agentChannels, agentRuns, agents, agentVersions, users } from '@/database/tables/index.js'
import { agentRunSteps } from '@/database/tables/partitioned/agentRuns.tables.js'
import { keysetAfter, keysetKey, keysetOrder } from '@/lib/pagination.js'
import { canEditSql } from '@/modules/agents/index.js'
import type { AgentChannelType, AgentRunStatus, AgentRunTrigger } from '@surefy/contracts'

import type { RunRow, StepRow } from './agentRuns.types.js'
import type { DbExecutor } from '@/core/database/index.js'
import type { KeysetCursor, KeysetSort } from '@/lib/pagination.js'
import type { Viewer } from '@/modules/agents/index.js'
import type { SQL } from 'drizzle-orm'

const r = agentRuns
const a = agents
const v = agentVersions
const c = agentChannels
const s = agentRunSteps

const allOf = (...conditions: (SQL | undefined)[]): SQL => and(...conditions) ?? sql`true`

const likeTerm = (q: string): string => `%${q.replaceAll(/[\\%_]/g, (ch) => '\\' + ch)}%`

/**
 * Whose runs a caller reads: a person sees the runs of agents they can edit (Admins all) and the
 * runs they started; an API key and a public channel see only the runs they started.
 */
export type RunScope =
  | { kind: 'person'; viewer: Viewer }
  | { kind: 'key'; keyId: string }
  | { kind: 'channel'; channelId: string }

export const scopeSql = (scope: RunScope): SQL => {
  if (scope.kind === 'key') return eq(r.apiKeyId, scope.keyId)
  if (scope.kind === 'channel') return eq(r.channelId, scope.channelId)
  const { viewer } = scope
  const own = viewer.userId === null ? undefined : eq(r.startedByUserId, viewer.userId)
  return or(canEditSql(viewer), own) ?? sql`false`
}

/** A run with the display data the Insights table and the run header show. */
export interface RunListRow {
  run: RunRow
  agentName: string
  agentDeleted: boolean
  agentVersion: number | null
  channelType: AgentChannelType | null
  /** The caller may edit the run's agent: cancel and retry need it. */
  canEdit: boolean
  sortKey: string
}

export interface RunFilters {
  agentId?: string
  statuses?: readonly AgentRunStatus[]
  triggers?: readonly AgentRunTrigger[]
  startedByUserId?: string
  teamId?: string
  modelKey?: string
  isTest?: boolean
  neededHuman?: boolean
  from?: Date
  to?: Date
  q?: string
}

export interface RunPage {
  limit: number
  sort: KeysetSort
  cursor?: KeysetCursor
  scope: RunScope
  filters: RunFilters
}

/** The sort fields of the Insights table as keyset sorts (every one is total with the run id). */
export function runSort(
  field: 'startedAt' | 'durationMs' | 'costMicros',
  descending: boolean,
): KeysetSort {
  switch (field) {
    case 'startedAt':
      return {
        expression: sql`coalesce(${r.startedAt}, ${r.createdAt})`,
        cast: 'timestamptz',
        descending,
      }
    case 'durationMs':
      return { expression: sql`coalesce(${r.durationMs}, 0)`, cast: 'bigint', descending }
    case 'costMicros':
      return { expression: r.costMicros, cast: 'bigint', descending }
  }
}

/** Reads of `agent_runs` and `agent_run_steps` for the run screens and endpoints (tenant transaction). */
export class AgentRunsReads {
  private base(tx: DbExecutor, scope: RunScope, sort?: KeysetSort) {
    return tx
      .select({
        run: r,
        canEdit:
          scope.kind === 'person' ? sql<boolean>`${canEditSql(scope.viewer)}` : sql<boolean>`false`,
        agentName: a.name,
        agentDeleted: sql<boolean>`${a.deletedAt} is not null`,
        agentVersion: v.version,
        channelType: c.type,
        sortKey: sort === undefined ? sql<string>`''` : keysetKey(sort),
      })
      .from(r)
      .innerJoin(a, and(eq(a.organizationId, r.organizationId), eq(a.id, r.agentId)))
      .leftJoin(v, and(eq(v.organizationId, r.organizationId), eq(v.id, r.agentVersionId)))
      .leftJoin(c, and(eq(c.organizationId, r.organizationId), eq(c.id, r.channelId)))
  }

  /** One page of runs, newest first by default; test runs only when the filter asks for them. */
  listPage(tx: DbExecutor, orgId: string, page: RunPage): Promise<RunListRow[]> {
    const f = page.filters
    const person = f.q === undefined ? undefined : likeTerm(f.q)
    return this.base(tx, page.scope, page.sort)
      .leftJoin(users, eq(users.id, r.startedByUserId))
      .where(
        allOf(
          eq(r.organizationId, orgId),
          scopeSql(page.scope),
          f.agentId === undefined ? undefined : eq(r.agentId, f.agentId),
          f.statuses === undefined || f.statuses.length === 0
            ? undefined
            : inArray(r.status, [...f.statuses]),
          f.triggers === undefined || f.triggers.length === 0
            ? undefined
            : inArray(r.trigger, [...f.triggers]),
          f.startedByUserId === undefined ? undefined : eq(r.startedByUserId, f.startedByUserId),
          f.teamId === undefined ? undefined : eq(r.teamId, f.teamId),
          f.modelKey === undefined ? undefined : eq(r.modelKey, f.modelKey),
          eq(r.isTest, f.isTest ?? false),
          f.neededHuman === undefined
            ? undefined
            : or(eq(r.neededHuman, true), eq(r.humanCorrected, true)),
          f.from === undefined ? undefined : gte(r.createdAt, f.from),
          f.to === undefined ? undefined : lte(r.createdAt, f.to),
          person === undefined
            ? undefined
            : or(
                sql`${r.id}::text ilike ${person}`,
                ilike(a.name, person),
                ilike(users.name, person),
                ilike(users.email, person),
              ),
          keysetAfter(page.sort, r.id, page.cursor),
        ),
      )
      .orderBy(...keysetOrder(page.sort, r.id))
      .limit(page.limit + 1)
  }

  /** One run the scope may read, with its display data. */
  async findRow(
    tx: DbExecutor,
    orgId: string,
    runId: string,
    scope: RunScope,
  ): Promise<RunListRow | undefined> {
    const [row] = await this.base(tx, scope)
      .where(and(eq(r.organizationId, orgId), eq(r.id, runId), scopeSql(scope)))
      .limit(1)
    return row
  }

  /** Steps in order. The window of the run bounds the partitions that are scanned. */
  listSteps(tx: DbExecutor, orgId: string, run: RunRow): Promise<StepRow[]> {
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

  async findStep(
    tx: DbExecutor,
    orgId: string,
    run: RunRow,
    seq: number,
  ): Promise<StepRow | undefined> {
    const [row] = await tx
      .select()
      .from(s)
      .where(
        and(
          eq(s.organizationId, orgId),
          eq(s.runId, run.id),
          eq(s.seq, seq),
          gte(s.createdAt, run.createdAt),
          run.finishedAt === null ? undefined : lte(s.createdAt, run.finishedAt),
        ),
      )
      .limit(1)
    return row
  }
}
