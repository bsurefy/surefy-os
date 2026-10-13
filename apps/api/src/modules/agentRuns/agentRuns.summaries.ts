// SPDX-License-Identifier: AGPL-3.0-only
import { and, eq, gte, inArray, lte, max, sql } from 'drizzle-orm'

import { agentRuns } from '@/database/tables/index.js'
import {
  AGENT_FAILED_RUNS_ATTENTION,
  AGENT_TRUST_MIN_RUNS,
  AGENT_TRUST_WINDOW_DAYS,
} from '@surefy/contracts'

import type { AgentRuns, AgentRunSummary } from '@/modules/agents/index.js'

const r = agentRuns

const DAY_MS = 86_400_000

interface Newest {
  last: NonNullable<AgentRunSummary['lastRun']>
  failed: number
  seen: number
}

/** Runs that count toward trust: finished on their own, not canceled by a person. */
const COUNTED = ['succeeded', 'failed', 'timed_out'] as const

/**
 * What an agent's runs say about it: the card's last run, runs this week, the trust score and the
 * "recent runs failed" reason (database/agents-and-runs.md, §5). Tests never count.
 */
export function createAgentRunSummaries(now: () => Date = () => new Date()): AgentRuns {
  return {
    async summaries(tx, orgId, agentIds) {
      const result = new Map<string, AgentRunSummary>()
      if (agentIds.length === 0) return result
      const week = new Date(now().getTime() - 7 * DAY_MS)
      const window = new Date(now().getTime() - AGENT_TRUST_WINDOW_DAYS * DAY_MS)
      const base = and(
        eq(r.organizationId, orgId),
        inArray(r.agentId, [...agentIds]),
        eq(r.isTest, false),
      )

      const counts = await tx
        .select({
          agentId: r.agentId,
          thisWeek: sql<number>`count(*) filter (where ${gte(r.createdAt, week)})`.mapWith(Number),
          counted: sql<number>`count(*) filter (where ${inArray(r.status, [...COUNTED])})`.mapWith(
            Number,
          ),
          good: sql<number>`count(*) filter (where ${eq(r.status, 'succeeded')} and ${eq(r.humanCorrected, false)})`.mapWith(
            Number,
          ),
        })
        .from(r)
        .where(and(base, gte(r.createdAt, window)))
        .groupBy(r.agentId)

      // the newest runs of each agent: the last one, and whether the last few all failed
      const ranked = tx
        .select({
          agentId: r.agentId,
          status: r.status,
          at: r.createdAt,
          rank: sql<number>`row_number() over (partition by ${r.agentId} order by ${r.createdAt} desc, ${r.id} desc)`
            .mapWith(Number)
            .as('rank'),
        })
        .from(r)
        .where(base)
        .as('ranked')
      const recent = await tx
        .select()
        .from(ranked)
        .where(lte(ranked.rank, AGENT_FAILED_RUNS_ATTENTION))
        .orderBy(ranked.agentId, ranked.rank)
      const newest = new Map<string, Newest>()
      for (const row of recent) {
        const entry = newest.get(row.agentId) ?? {
          last: { status: row.status, at: row.at },
          failed: 0,
          seen: 0,
        }
        entry.seen += 1
        if (row.status === 'failed' || row.status === 'timed_out') entry.failed += 1
        newest.set(row.agentId, entry)
      }

      for (const agentId of agentIds) {
        const count = counts.find((row) => row.agentId === agentId)
        const last = newest.get(agentId)
        const counted = count?.counted ?? 0
        result.set(agentId, {
          lastRun: last?.last ?? null,
          runsThisWeek: count?.thisWeek ?? 0,
          trust: {
            score: counted >= AGENT_TRUST_MIN_RUNS ? (count?.good ?? 0) / counted : null,
            runs: counted,
          },
          recentRunsFailed:
            last !== undefined &&
            last.seen >= AGENT_FAILED_RUNS_ATTENTION &&
            last.failed === last.seen,
        })
      }
      return result
    },

    async countRuns(tx, orgId, agentId) {
      const [row] = await tx
        .select({ count: sql<number>`count(*)`.mapWith(Number) })
        .from(r)
        .where(and(eq(r.organizationId, orgId), eq(r.agentId, agentId), eq(r.isTest, false)))
      return row?.count ?? 0
    },

    async lastTestRunAt(tx, orgId, agentId) {
      const [row] = await tx
        .select({ at: max(r.createdAt) })
        .from(r)
        .where(and(eq(r.organizationId, orgId), eq(r.agentId, agentId), eq(r.isTest, true)))
      return row?.at ?? null
    },
  }
}
