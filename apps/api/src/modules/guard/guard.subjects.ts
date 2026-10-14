// SPDX-License-Identifier: AGPL-3.0-only
import { and, asc, desc, eq, gte, inArray, isNotNull, isNull, lt, sql } from 'drizzle-orm'

import {
  agentAccess,
  agentRuns,
  agentRunSteps,
  agents,
  agentVersions,
  guardrails,
  teamMembers,
} from '@/database/tables/index.js'
import { GUARD_ERROR_CODES } from '@surefy/contracts'
import type {
  AgentDefinition,
  Approver,
  GuardrailImpactDto,
  GuardRuleRowDto,
} from '@surefy/contracts'

import type { ActionCounts, GuardSubjects } from './guard.types.js'
import type { DbExecutor } from '@/core/database/index.js'

/** The most agents an impact answer names; the counts cover all of them. */
const IMPACT_LISTED_MAX = 50

const DAY_MS = 86_400_000

/** Agents that answer people: published and not archived (a paused agent keeps its rules). */
const LIVE_STATUSES = ['active', 'paused'] as const

/** An agent as its live version defines it. */
interface LiveAgent {
  id: string
  name: string
  ownerUserId: string | null
  definition: AgentDefinition
}

/** The organization's live agents, by name. */
async function liveAgents(tx: DbExecutor, orgId: string): Promise<LiveAgent[]> {
  const rows = await tx
    .select({
      id: agents.id,
      name: agents.name,
      ownerUserId: agents.ownerUserId,
      definition: agentVersions.definition,
    })
    .from(agents)
    .innerJoin(
      agentVersions,
      and(
        eq(agentVersions.organizationId, agents.organizationId),
        eq(agentVersions.id, agents.liveVersionId),
      ),
    )
    .where(
      and(
        eq(agents.organizationId, orgId),
        isNull(agents.deletedAt),
        inArray(agents.status, LIVE_STATUSES),
      ),
    )
    .orderBy(asc(agents.name), asc(agents.id))
  return rows
}

/** The agents a team's people can use: shared with the organization, the team or one of its members, or owned by one. */
async function agentsOfTeam(
  tx: DbExecutor,
  orgId: string,
  teamId: string,
  live: readonly LiveAgent[],
): Promise<LiveAgent[]> {
  if (live.length === 0) return []
  // one transaction runs one query at a time
  const members = await tx
    .select({ userId: teamMembers.userId })
    .from(teamMembers)
    .where(and(eq(teamMembers.organizationId, orgId), eq(teamMembers.teamId, teamId)))
  const access = await tx
    .select({
      agentId: agentAccess.agentId,
      subjectType: agentAccess.subjectType,
      teamId: agentAccess.teamId,
      userId: agentAccess.userId,
    })
    .from(agentAccess)
    .where(
      and(
        eq(agentAccess.organizationId, orgId),
        inArray(
          agentAccess.agentId,
          live.map((agent) => agent.id),
        ),
      ),
    )
  const memberIds = new Set(members.map((member) => member.userId))
  const reached = new Set<string>()
  for (const row of access) {
    if (
      row.subjectType === 'organization' ||
      (row.subjectType === 'team' && row.teamId === teamId) ||
      (row.subjectType === 'user' && row.userId !== null && memberIds.has(row.userId))
    ) {
      reached.add(row.agentId)
    }
  }
  return live.filter(
    (agent) =>
      reached.has(agent.id) || (agent.ownerUserId !== null && memberIds.has(agent.ownerUserId)),
  )
}

/** The agents a stored guardrail applies to: every live agent for an organization rule, a team's agents for a team rule. */
async function appliesTo(
  tx: DbExecutor,
  orgId: string,
  rules: readonly { id: string; scope: string; teamId: string | null }[],
): Promise<Map<string, LiveAgent[]>> {
  const live = rules.length === 0 ? [] : await liveAgents(tx, orgId)
  const ofTeam = new Map<string, Promise<LiveAgent[]>>()
  const result = new Map<string, LiveAgent[]>()
  for (const rule of rules) {
    if (rule.scope !== 'team' || rule.teamId === null) {
      result.set(rule.id, live)
      continue
    }
    const cached = ofTeam.get(rule.teamId) ?? agentsOfTeam(tx, orgId, rule.teamId, live)
    ofTeam.set(rule.teamId, cached)
    result.set(rule.id, await cached)
  }
  return result
}

const RULE_KINDS = [
  { key: 'approvalRules', type: 'approval_rule', label: 'Approval rule' },
  { key: 'actionLimits', type: 'action_limit', label: 'Action limit' },
  { key: 'blockedActions', type: 'blocked_action', label: 'Blocked' },
] as const

/** The rows an agent's live definition adds to the Guardrails table (read-only, edited in the agent). */
function rowsOf(agent: LiveAgent): GuardRuleRowDto[] {
  const row = (ruleKey: string, type: GuardRuleRowDto['type'], label: string): GuardRuleRowDto => ({
    id: agent.id,
    ruleKey,
    name: `${agent.name}: ${label}`,
    type,
    scope: 'agent',
    team: null,
    usedByCount: 1,
    triggeredThisWeek: 0,
    isEnabled: true,
    isLocked: false,
    lockedBy: null,
    lockedReason: null,
    editTarget: { type: 'agent', id: agent.id },
  })
  const { guard } = agent.definition
  return [
    ...(guard.thresholds === null
      ? []
      : [row('thresholds', 'threshold_override', 'confidence thresholds')]),
    ...RULE_KINDS.flatMap(({ key, type, label }) =>
      guard[key].map((rule) => row(rule.id, type, `${label} ${rule.match.action}`)),
    ),
  ]
}

/** `2026-10-08` as the start and end of that UTC day. */
function dayBounds(day: string): { from: Date; to: Date } {
  const from = new Date(`${day}T00:00:00.000Z`)
  return { from, to: new Date(from.getTime() + DAY_MS) }
}

/**
 * What the agents and run modules tell Guard, read straight from their rows: the live definitions
 * of the organization's agents and the Guard steps of its runs. Agent rules, "Used by" and impact
 * need no stored edges because organization and team rules reach agents by scope, not by
 * reference. Flows add their own rows when they land.
 */
export function createGuardSubjects(): GuardSubjects {
  return {
    async ruleRows(tx, orgId) {
      return (await liveAgents(tx, orgId)).flatMap(rowsOf)
    },

    async impact(tx, orgId, guardrailId): Promise<GuardrailImpactDto> {
      const [rule] = await tx
        .select({ id: guardrails.id, scope: guardrails.scope, teamId: guardrails.teamId })
        .from(guardrails)
        .where(and(eq(guardrails.organizationId, orgId), eq(guardrails.id, guardrailId)))
      if (rule === undefined) return { dependents: [], listed: [] }
      const affected = (await appliesTo(tx, orgId, [rule])).get(rule.id) ?? []
      return {
        dependents: affected.length === 0 ? [] : [{ type: 'agent', count: affected.length }],
        listed: affected
          .slice(0, IMPACT_LISTED_MAX)
          .map((agent) => ({ type: 'agent', id: agent.id, name: agent.name })),
      }
    },

    async usedBy(tx, orgId, guardrailIds) {
      if (guardrailIds.length === 0) return new Map()
      const rules = await tx
        .select({ id: guardrails.id, scope: guardrails.scope, teamId: guardrails.teamId })
        .from(guardrails)
        .where(and(eq(guardrails.organizationId, orgId), inArray(guardrails.id, [...guardrailIds])))
      const affected = await appliesTo(tx, orgId, rules)
      return new Map([...affected].map(([id, list]) => [id, list.length]))
    },

    async agentNames(tx, orgId, agentIds) {
      if (agentIds.length === 0) return new Map()
      const rows = await tx
        .select({ id: agents.id, name: agents.name })
        .from(agents)
        .where(and(eq(agents.organizationId, orgId), inArray(agents.id, [...agentIds])))
      return new Map(rows.map((row) => [row.id, row.name]))
    },

    async outdatedThresholds(tx, orgId, thresholds) {
      const outdated = (await liveAgents(tx, orgId)).filter(({ definition }) => {
        const own = definition.guard.thresholds
        return (
          own !== null && (own.autoBp < thresholds.autoBp || own.reviewBp < thresholds.reviewBp)
        )
      })
      return { count: outdated.length, firstAgentId: outdated[0]?.id ?? null }
    },

    async recentConfidences(tx, orgId, limit) {
      // test runs count: the preview is about how the agents behave, and a new agent has only tests
      const rows = await tx
        .select({ confidence: agentRunSteps.confidence })
        .from(agentRunSteps)
        .where(
          and(
            eq(agentRunSteps.organizationId, orgId),
            isNotNull(agentRunSteps.guardBand),
            isNotNull(agentRunSteps.confidence),
          ),
        )
        .orderBy(desc(agentRunSteps.createdAt), desc(agentRunSteps.id))
        .limit(limit)
      return rows.flatMap((row) => (row.confidence === null ? [] : [row.confidence]))
    },

    async actionCounts(tx, day) {
      const { from, to } = dayBounds(day)
      const rows = await tx
        .select({
          organizationId: agentRunSteps.organizationId,
          band: agentRunSteps.guardBand,
          errorCode: agentRunSteps.errorCode,
          total: sql<string>`count(*)`,
        })
        .from(agentRunSteps)
        .innerJoin(
          agentRuns,
          and(
            eq(agentRuns.organizationId, agentRunSteps.organizationId),
            eq(agentRuns.id, agentRunSteps.runId),
          ),
        )
        .where(
          and(
            isNotNull(agentRunSteps.guardBand),
            eq(agentRuns.isTest, false),
            gte(agentRunSteps.createdAt, from),
            lt(agentRunSteps.createdAt, to),
          ),
        )
        .groupBy(agentRunSteps.organizationId, agentRunSteps.guardBand, agentRunSteps.errorCode)
      const byOrganization = new Map<string, ActionCounts>()
      for (const row of rows) {
        const counts = byOrganization.get(row.organizationId) ?? {
          organizationId: row.organizationId,
          auto: 0,
          doubleCheck: 0,
          human: 0,
          blockedRule: 0,
          blockedLimit: 0,
        }
        const total = Number(row.total)
        if (row.band === 'auto') counts.auto += total
        else if (row.band === 'double_check') counts.doubleCheck += total
        else if (row.band === 'human') counts.human += total
        else if (row.errorCode === GUARD_ERROR_CODES.GUARD_ACTION_LIMIT)
          counts.blockedLimit += total
        else counts.blockedRule += total
        byOrganization.set(row.organizationId, counts)
      }
      return [...byOrganization.values()]
    },

    async agentRuleEscalation(tx, orgId, ref): Promise<readonly Approver[] | null> {
      const [row] = await tx
        .select({ definition: agentVersions.definition })
        .from(agentVersions)
        .where(
          and(
            eq(agentVersions.organizationId, orgId),
            eq(agentVersions.agentId, ref.agentId),
            eq(agentVersions.version, ref.version),
          ),
        )
      const rule = row?.definition.guard.approvalRules.find(({ id }) => id === ref.ruleId)
      return rule === undefined ? null : rule.escalateTo
    },
  }
}
