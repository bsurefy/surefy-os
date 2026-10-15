// SPDX-License-Identifier: AGPL-3.0-only
import type { AgentDefinition, AgentRunInput } from '@surefy/contracts'

import { inputOf } from './agentRuns.state.js'

import type {
  AgentRunsAgents,
  AgentRunsPeople,
  RunnableAgent,
  RunPerson,
  RunRow,
  StepRow,
} from './agentRuns.types.js'
import type { Database } from '@/core/database/index.js'
import type { AgentToolsContext, ResolvedTool } from '@/modules/agentTools/index.js'
import type { ModelCallContext } from '@/modules/modelGateway/index.js'

/** Everything about a run the executor reads once, when it claims the run. */
export interface RunSession {
  orgId: string
  runId: string
  agent: RunnableAgent
  /** The version that runs; null for a test run of the draft. */
  version: number | null
  /** Immutable for the whole run: a publish, a rollback or a draft save never changes it. */
  definition: AgentDefinition
  input: AgentRunInput
  /** The person who started the run; null for the API, the widget, Slack and WhatsApp. */
  starterId: string | null
  starter: RunPerson | null
  /** The teams Guard's rules apply for: the starter's, else the agent owner's. */
  guardTeamIds: readonly string[]
  /** Whose access decides which connections a tool may use. */
  tools: AgentToolsContext
  signal: AbortSignal
  /** Resolved on first use, then kept for the life of this executor. */
  resolved: ResolvedTool[] | undefined
  /**
   * The model call context for the step with this `seq`: the meter key makes a retried call count
   * once. `piiMasked` is whether the personal-data filter changed what the call sends.
   */
  modelContext(seq: number, piiMasked?: boolean): ModelCallContext
}

export interface SessionDeps {
  db: Database
  agents: AgentRunsAgents
  people: AgentRunsPeople
}

export type OpenResult =
  | { ok: true; session: RunSession }
  | { ok: false; errorCode: 'AGENT_NOT_FOUND' | 'AGENT_NOT_PUBLISHED' | 'VALIDATION_FAILED' }

/** Loads the agent, the definition the run executes and the people it acts for. */
export async function openSession(
  deps: SessionDeps,
  run: RunRow,
  steps: readonly StepRow[],
  signal: AbortSignal,
): Promise<OpenResult> {
  const orgId = run.organizationId
  const input = inputOf(steps)
  if (input === undefined) return { ok: false, errorCode: 'VALIDATION_FAILED' }
  const loaded = await deps.db.tenant(orgId, async (tx) => {
    const agent = await deps.agents.findById(tx, orgId, run.agentId)
    if (agent === undefined) return
    const version =
      run.agentVersionId === null
        ? undefined
        : await deps.agents.findVersion(tx, orgId, run.agentId, run.agentVersionId)
    return { agent, version }
  })
  if (loaded === undefined) return { ok: false, errorCode: 'AGENT_NOT_FOUND' }
  const { agent, version } = loaded

  let definition: AgentDefinition | null
  if (run.isTest) {
    definition = input.definitionSnapshot
  } else {
    definition = version?.definition ?? null
  }
  if (definition === null) {
    return { ok: false, errorCode: run.isTest ? 'VALIDATION_FAILED' : 'AGENT_NOT_PUBLISHED' }
  }

  const starter =
    run.startedByUserId === null ? null : await deps.people.forMember(orgId, run.startedByUserId)
  const owner =
    starter === null && agent.ownerUserId !== null
      ? await deps.people.forMember(orgId, agent.ownerUserId)
      : null
  const guardTeamIds = (starter ?? owner)?.teamIds ?? []
  // a tool acts for the person who started the run, else for the agent's owner
  let principalUserId: string | null = run.startedByUserId
  if (starter === null) principalUserId = owner === null ? null : agent.ownerUserId

  return {
    ok: true,
    session: {
      orgId,
      runId: run.id,
      agent,
      version: version?.version ?? null,
      definition,
      input,
      starterId: starter === null ? null : run.startedByUserId,
      starter,
      guardTeamIds,
      tools: {
        orgId,
        principal: { userId: principalUserId, teamIds: guardTeamIds },
        run: {
          runId: run.id,
          agentId: agent.id,
          starterId: starter === null ? null : run.startedByUserId,
        },
      },
      signal,
      resolved: undefined,
      modelContext: (seq, piiMasked = false) => ({
        orgId,
        userId: starter === null ? null : run.startedByUserId,
        teamIds: starter?.teamIds ?? [],
        primaryTeamId: run.teamId,
        // the agent's model was checked for every audience entry when it was published
        allowedModelIds: 'all',
        caller: 'agent',
        apiKeyId: run.apiKeyId,
        meter: {
          key: `agent_run:${run.id}:${seq}`,
          sourceRefId: run.id,
          subject: { type: 'agent', id: agent.id },
          piiMasked,
        },
      }),
    },
  }
}
