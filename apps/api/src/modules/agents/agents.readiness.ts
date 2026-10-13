// SPDX-License-Identifier: AGPL-3.0-only
import { AGENT_READINESS_BLOCKING, AGENT_READINESS_ITEMS } from '@surefy/contracts'
import type {
  AgentAccessEntryInput,
  AgentDefinition,
  AgentReadinessDto,
  AgentReadinessItemDto,
  AgentReadinessItemKey,
} from '@surefy/contracts'

import type { AgentRow } from './agents.repository.js'
import type {
  AgentRuns,
  AgentsConnections,
  AgentsGuard,
  AgentsModels,
  AgentsTeams,
  AgentsUserRefs,
  AudienceSubject,
} from './agents.types.js'
import type { DbExecutor } from '@/core/database/index.js'

export interface AgentReadinessDeps {
  models: AgentsModels
  connections: AgentsConnections
  guard: AgentsGuard
  runs: AgentRuns
  teams: AgentsTeams
  users: AgentsUserRefs
}

type Failure = AgentReadinessItemDto['failures'][number]

/** An item passes when nothing fails; some items pass or fail with no part to name. */
interface Outcome {
  passed: boolean
  failures: Failure[]
}

const failing = (failures: Failure[]): Outcome => ({ passed: failures.length === 0, failures })

const TAB: Record<AgentReadinessItemKey, AgentReadinessItemDto['tab']> = {
  instructions_present: 'instructions',
  model_allowed_for_audience: 'model',
  tools_connected: 'tools',
  guard_not_looser: 'guard',
  tested_since_change: 'test',
  can_act_without_approval_rule: 'guard',
}

/** The most failing parts one item lists. */
const FAILURES_MAX = 50

/** Whether a rule of the agent matches a tool: by name, or by category prefix (`payments` for `payments.refund`). */
const ruleMatches = (action: string, toolName: string): boolean => {
  const rule = action.trim().toLowerCase()
  const tool = toolName.trim().toLowerCase()
  return rule === tool || tool.startsWith(`${rule}.`)
}

/**
 * The readiness checklist of the Publish tab (design/workspace/agents.md › Editor): the blocking
 * items that disable Publish, and the warnings that do not. It reads the draft and the audience
 * the agent would have after the publish.
 */
export class AgentReadiness {
  constructor(private readonly deps: AgentReadinessDeps) {}

  async check(
    tx: DbExecutor,
    orgId: string,
    agent: AgentRow,
    audience: readonly AgentAccessEntryInput[],
  ): Promise<AgentReadinessDto> {
    const definition = agent.draftDefinition
    const results: Record<AgentReadinessItemKey, Outcome> = {
      instructions_present: { passed: definition.instructions.trim() !== '', failures: [] },
      model_allowed_for_audience: failing(
        await this.modelFailures(tx, orgId, definition, audience),
      ),
      tools_connected: failing(await this.toolFailures(tx, orgId, definition)),
      guard_not_looser: failing(await this.guardFailures(tx, orgId, definition)),
      tested_since_change: { passed: await this.wasTested(tx, orgId, agent), failures: [] },
      can_act_without_approval_rule: failing(unguardedActors(definition)),
    }
    const items = AGENT_READINESS_ITEMS.map((key): AgentReadinessItemDto => {
      const { passed, failures } = results[key]
      return {
        key,
        severity: (AGENT_READINESS_BLOCKING as readonly string[]).includes(key)
          ? 'blocking'
          : 'warning',
        passed,
        tab: TAB[key],
        failures: failures.slice(0, FAILURES_MAX),
      }
    })
    return {
      items,
      canPublish: items.every((item) => item.severity !== 'blocking' || item.passed),
    }
  }

  /** The model must work at all, and for each team and person the agent is shared with. */
  async modelFailures(
    tx: DbExecutor,
    orgId: string,
    definition: AgentDefinition,
    audience: readonly AgentAccessEntryInput[],
  ): Promise<Failure[]> {
    const { modelKey } = definition.model
    const failures: Failure[] = []
    const unavailable = await this.deps.models.unavailable(tx, orgId, [modelKey])
    if (unavailable.has(modelKey)) failures.push({ type: 'model', id: null, name: modelKey })
    const names = await this.audienceNames(tx, orgId, audience)
    for (const entry of audience) {
      const subject = await this.subjectOf(tx, orgId, entry)
      if (await this.deps.models.isAllowedFor(tx, orgId, modelKey, subject)) continue
      failures.push(
        entry.subjectType === 'organization'
          ? { type: 'organization', id: null, name: 'Everyone' }
          : {
              type: entry.subjectType,
              id: entry.subjectType === 'team' ? entry.teamId : entry.userId,
              name: names.get(entry.subjectType === 'team' ? entry.teamId : entry.userId) ?? '',
            },
      )
    }
    return failures
  }

  /** Every enabled tool that needs an account has a connection that works. */
  private async toolFailures(
    tx: DbExecutor,
    orgId: string,
    definition: AgentDefinition,
  ): Promise<Failure[]> {
    const enabled = definition.tools.filter((tool) => tool.enabled)
    const ids = enabled.flatMap((tool) =>
      'connectionId' in tool && tool.connectionId !== null ? [tool.connectionId] : [],
    )
    const statuses = await this.deps.connections.statuses(tx, orgId, ids)
    return enabled.flatMap((tool): Failure[] => {
      const failure = { type: 'tool', id: tool.id, name: tool.name }
      if (tool.kind !== 'api' && tool.kind !== 'mcp' && tool.kind !== 'bridge_action') return []
      if (tool.connectionId === null) return tool.kind === 'api' ? [] : [failure]
      return statuses.get(tool.connectionId)?.status === 'active' ? [] : [failure]
    })
  }

  /** The agent's own thresholds may not sit below the organization's. */
  private async guardFailures(
    tx: DbExecutor,
    orgId: string,
    definition: AgentDefinition,
  ): Promise<Failure[]> {
    const own = definition.guard.thresholds
    if (own === null) return []
    const organization = await this.deps.guard.organizationThresholdsInTx(tx, orgId)
    return [
      ...(own.autoBp < organization.autoBp
        ? [{ type: 'guard', id: null, name: 'Automatic threshold' }]
        : []),
      ...(own.reviewBp < organization.reviewBp
        ? [{ type: 'guard', id: null, name: 'Review threshold' }]
        : []),
    ]
  }

  /** The draft was tried in the Test tab after it last changed. */
  private async wasTested(tx: DbExecutor, orgId: string, agent: AgentRow): Promise<boolean> {
    const last = await this.deps.runs.lastTestRunAt(tx, orgId, agent.id)
    return last !== null && last.getTime() >= agent.draftUpdatedAt.getTime()
  }

  private async audienceNames(
    tx: DbExecutor,
    orgId: string,
    audience: readonly AgentAccessEntryInput[],
  ): Promise<ReadonlyMap<string, string>> {
    const teamIds = audience.flatMap((entry) =>
      entry.subjectType === 'team' ? [entry.teamId] : [],
    )
    const userIds = audience.flatMap((entry) =>
      entry.subjectType === 'user' ? [entry.userId] : [],
    )
    const [teams, users] = await Promise.all([
      this.deps.teams.findRefsInTx(tx, orgId, teamIds),
      this.deps.users.findUserRefs(userIds),
    ])
    return new Map([
      ...teams.map((team): [string, string] => [team.id, team.name]),
      ...[...users.values()].map((user): [string, string] => [user.id, user.name]),
    ])
  }

  private async subjectOf(
    tx: DbExecutor,
    orgId: string,
    entry: AgentAccessEntryInput,
  ): Promise<AudienceSubject> {
    if (entry.subjectType === 'organization') return { type: 'organization' }
    if (entry.subjectType === 'team') return { type: 'team', teamId: entry.teamId }
    return {
      type: 'user',
      userId: entry.userId,
      teamIds: await this.deps.teams.listTeamIdsForUserInTx(tx, orgId, entry.userId),
    }
  }
}

/** "Can act" tools that no approval rule of the agent covers. */
function unguardedActors(definition: AgentDefinition): Failure[] {
  return definition.tools
    .filter((tool) => tool.enabled && tool.permission === 'can_act')
    .filter(
      (tool) =>
        !definition.guard.approvalRules.some((rule) => ruleMatches(rule.match.action, tool.name)),
    )
    .map((tool) => ({ type: 'tool', id: tool.id, name: tool.name }))
}
