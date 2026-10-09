// SPDX-License-Identifier: AGPL-3.0-only
import { AGENT_RUN_MAX_TOOL_CALLS, AGENT_RUN_MAX_TURNS } from '@surefy/contracts'
import type { AgentDefinition } from '@surefy/contracts'

import { planCall, stretchExceeded } from './agentRuns.state.js'

import type { CallNeed, CallState, RunState } from './agentRuns.state.js'
import type { ResolvedTool } from '@/modules/agentTools/index.js'

/** The one thing the executor does next. */
export type Move =
  | { kind: 'timeout' }
  | { kind: 'turn_limit' }
  | { kind: 'succeed'; text: string }
  | { kind: 'retrieve' }
  | { kind: 'model' }
  | {
      kind: 'call'
      need: Exclude<CallNeed, 'done' | 'request_approval' | 'await_approval'>
      call: CallState
      tool: ResolvedTool | undefined
      extra: boolean
    }
  | { kind: 'request_approvals'; calls: { call: CallState; tool: ResolvedTool | undefined }[] }
  | { kind: 'wait'; approvalIds: string[] }

export interface MoveInput {
  state: RunState
  definition: Pick<AgentDefinition, 'knowledge'>
  tools: readonly ResolvedTool[]
  /** Approvals Guard created that a person has decided, by id. */
  decided: ReadonlySet<string>
  now: Date
}

/**
 * Reads the steps and says what the executor does next (backend/agent-runs.md, §4). The order
 * within a turn is fixed: Guard checks every call, then the calls Guard allowed run, then the
 * calls that need a person are put to one, and only then does the run wait. Everything is a
 * function of the steps, so a worker that takes over decides exactly as its predecessor would.
 */
export function nextMove(input: MoveInput): Move {
  const { state, tools } = input
  if (stretchExceeded(state, input.now)) return { kind: 'timeout' }
  const turn = state.turn
  if (turn?.calls.length === 0) return { kind: 'succeed', text: turn.text }

  const open = turn?.calls.filter((call) => call.tool === undefined) ?? []
  if (turn === undefined || open.length === 0) {
    if (state.turns >= AGENT_RUN_MAX_TURNS) return { kind: 'turn_limit' }
    const searches = input.definition.knowledge.knowledgeBaseIds.length > 0
    if (turn === undefined && state.retrieval === undefined && searches) return { kind: 'retrieve' }
    return { kind: 'model' }
  }

  const calls = turn.calls
  const planned = calls.map((call, index) => {
    const tool = tools.find((candidate) => candidate.callName === call.name)
    const extra = index >= AGENT_RUN_MAX_TOOL_CALLS
    const approvalId = call.approvalId
    let need: CallNeed
    if (extra) {
      need = call.tool === undefined ? 'record_blocked' : 'done'
    } else {
      need = planCall(call, {
        permission: tool?.permission,
        approvalResolved: approvalId !== null && input.decided.has(approvalId),
      })
    }
    return { call, tool, extra, need }
  })

  const first = (needs: readonly CallNeed[]) => planned.find((entry) => needs.includes(entry.need))
  const extra = planned.find((entry) => entry.extra && entry.need === 'record_blocked')
  if (extra !== undefined)
    return { kind: 'call', need: 'record_blocked', call: extra.call, tool: extra.tool, extra: true }
  const checking = first(['decide', 'guard'])
  if (checking !== undefined) return call(checking)
  const running = first(['execute', 'record_blocked', 'record_rejected'])
  if (running !== undefined) return call(running)
  const asking = planned.filter((entry) => entry.need === 'request_approval')
  if (asking.length > 0) {
    return {
      kind: 'request_approvals',
      calls: asking.map(({ call: c, tool }) => ({ call: c, tool })),
    }
  }
  const closing = first(['resolve_approval'])
  if (closing !== undefined) return call(closing)
  const waiting = planned.filter((entry) => entry.need === 'await_approval')
  return {
    kind: 'wait',
    approvalIds: waiting.flatMap((entry) =>
      entry.call.approvalId === null ? [] : [entry.call.approvalId],
    ),
  }
}

const call = (entry: {
  call: CallState
  tool: ResolvedTool | undefined
  extra: boolean
  need: CallNeed
}): Move => ({
  kind: 'call',
  need: entry.need as Extract<Move, { kind: 'call' }>['need'],
  call: entry.call,
  tool: entry.tool,
  extra: entry.extra,
})
