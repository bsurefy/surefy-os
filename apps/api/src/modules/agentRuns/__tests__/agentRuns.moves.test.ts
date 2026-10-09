// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, it } from 'vitest'

import {
  AGENT_RUN_MAX_SECONDS,
  AGENT_RUN_MAX_TOOL_CALLS,
  AGENT_RUN_MAX_TURNS,
} from '@surefy/contracts'

import {
  approvalClosed,
  approvalWaiting,
  call,
  guardResult,
  guardStep,
  inputStep,
  modelStep,
  step,
  toolStep,
} from './stepFixtures.js'
import { nextMove } from '../agentRuns.moves.js'
import { deriveState } from '../agentRuns.state.js'

import type { StepRow } from '../agentRuns.types.js'
import type { ResolvedTool } from '@/modules/agentTools/index.js'

const startedAt = new Date('2026-10-09T10:00:00.000Z')
const run = { startedAt, createdAt: startedAt }
const soon = new Date(startedAt.getTime() + 5_000)

const tool = (callName: string, permission: ResolvedTool['permission']): ResolvedTool =>
  ({ callName, toolName: callName, label: callName, permission }) as ResolvedTool

const TOOLS = [tool('refund_api', 'ask_first'), tool('lookup_api', 'read_only')]
const WITHOUT_KNOWLEDGE = {
  knowledge: { knowledgeBaseIds: [], citeSources: true, onlyFromKnowledge: false },
}
const WITH_KNOWLEDGE = {
  knowledge: {
    knowledgeBaseIds: ['0198f3a0-0000-7000-8000-0000000000c1'],
    citeSources: true,
    onlyFromKnowledge: false,
  },
}

const moveOf = (
  steps: StepRow[],
  options: { definition?: typeof WITH_KNOWLEDGE; decided?: string[]; now?: Date } = {},
) => {
  const state = deriveState(run, steps)
  if (state === undefined) throw new Error('no input step')
  return nextMove({
    state,
    definition: options.definition ?? WITHOUT_KNOWLEDGE,
    tools: TOOLS,
    decided: new Set(options.decided ?? []),
    now: options.now ?? soon,
  })
}

describe('nextMove', () => {
  it('searches knowledge first, only on the first turn, then asks the model', () => {
    expect(moveOf([inputStep()], { definition: WITH_KNOWLEDGE }).kind).toBe('retrieve')
    expect(moveOf([inputStep()]).kind).toBe('model')
    const searched = step(2, {
      type: 'retrieval',
      output: { version: 1, truncated: false, kind: 'retrieval', passages: [] },
    })
    expect(moveOf([inputStep(), searched], { definition: WITH_KNOWLEDGE }).kind).toBe('model')
  })

  it('finishes with the answer of a model step that asked for nothing', () => {
    const move = moveOf([inputStep(), modelStep(2, { text: 'Done.', toolCalls: [] })])
    expect(move).toEqual({ kind: 'succeed', text: 'Done.' })
  })

  it('asks the model again once every call has a result', () => {
    const steps = [
      inputStep(),
      modelStep(2, { text: '', toolCalls: [call('c1', 'lookup_api')] }),
      guardStep(3, 'c1', guardResult('auto')),
      toolStep(4, 'c1'),
    ]
    expect(moveOf(steps).kind).toBe('model')
  })

  it('checks every call before running any, and runs before it asks anyone', () => {
    const asked = modelStep(2, {
      text: '',
      toolCalls: [call('c1', 'refund_api'), call('c2', 'lookup_api')],
    })
    // the read-only call is checked first, the other one is decided
    const first = moveOf([inputStep(), asked])
    expect(first).toMatchObject({ kind: 'call', need: 'decide', call: { id: 'c1' } })
    const decided = [
      inputStep(),
      asked,
      step(3, {
        type: 'decision',
        confidence: 0.9,
        output: { version: 1, truncated: false, kind: 'decision', callId: 'c1' },
      }),
    ]
    expect(moveOf(decided)).toMatchObject({ kind: 'call', need: 'guard', call: { id: 'c1' } })
    const checkedOne = [...decided, guardStep(4, 'c1', guardResult('human', 'a1'))]
    expect(moveOf(checkedOne)).toMatchObject({ kind: 'call', need: 'guard', call: { id: 'c2' } })
    const checkedBoth = [...checkedOne, guardStep(5, 'c2', guardResult('auto'))]
    expect(moveOf(checkedBoth)).toMatchObject({ kind: 'call', need: 'execute', call: { id: 'c2' } })
    const ran = [...checkedBoth, toolStep(6, 'c2')]
    expect(moveOf(ran)).toMatchObject({ kind: 'request_approvals' })
  })

  it('waits while an approval is open and resolves it when a person decided', () => {
    const base = [
      inputStep(),
      modelStep(2, { text: '', toolCalls: [call('c1', 'refund_api')] }),
      step(3, {
        type: 'decision',
        confidence: 0.4,
        output: { version: 1, truncated: false, kind: 'decision', callId: 'c1' },
      }),
      guardStep(4, 'c1', guardResult('human', 'a1')),
      approvalWaiting(5, 'c1', 'a1'),
    ]
    expect(moveOf(base)).toEqual({ kind: 'wait', approvalIds: ['a1'] })
    expect(moveOf(base, { decided: ['a1'] })).toMatchObject({
      kind: 'call',
      need: 'resolve_approval',
    })
    const closed = [...base, approvalClosed(6, 'c1', 'a1', 'rejected')]
    expect(moveOf(closed, { decided: ['a1'] })).toMatchObject({
      kind: 'call',
      need: 'record_rejected',
    })
  })

  it('answers a tool that does not exist and the calls beyond the limit', () => {
    const unknown = moveOf([
      inputStep(),
      modelStep(2, { text: '', toolCalls: [call('c1', 'nope_api')] }),
    ])
    expect(unknown).toMatchObject({ kind: 'call', need: 'record_blocked', extra: false })
    const many = Array.from({ length: AGENT_RUN_MAX_TOOL_CALLS + 1 }, (_, index) =>
      call(`c${index}`, 'lookup_api'),
    )
    const steps: StepRow[] = [inputStep(), modelStep(2, { text: '', toolCalls: many })]
    let seq = 3
    for (const entry of many.slice(0, AGENT_RUN_MAX_TOOL_CALLS)) {
      steps.push(guardStep(seq, entry.id, guardResult('auto')), toolStep(seq + 1, entry.id))
      seq += 2
    }
    expect(moveOf(steps)).toMatchObject({ kind: 'call', need: 'record_blocked', extra: true })
  })

  it('stops a run that used up its turns or its time', () => {
    const turns: StepRow[] = [inputStep()]
    for (let index = 0; index < AGENT_RUN_MAX_TURNS; index += 1) {
      const seq = turns.length + 1
      turns.push(modelStep(seq, { text: '', toolCalls: [call(`c${index}`, 'lookup_api')] }))
      turns.push(
        guardStep(seq + 1, `c${index}`, guardResult('auto')),
        toolStep(seq + 2, `c${index}`),
      )
    }
    expect(moveOf(turns).kind).toBe('turn_limit')
    const late = new Date(startedAt.getTime() + (AGENT_RUN_MAX_SECONDS + 1) * 1000)
    expect(moveOf([inputStep()], { now: late }).kind).toBe('timeout')
  })
})
