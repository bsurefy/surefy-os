// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, it } from 'vitest'

import {
  approvalClosed,
  approvalWaiting,
  call,
  decisionStep,
  guardResult,
  guardStep,
  inputStep,
  modelStep,
  toolStep,
} from './stepFixtures.js'
import { argumentsOf, deriveState, inputOf, planCall, stretchStart } from '../agentRuns.state.js'

import type { CallState } from '../agentRuns.state.js'
import type { step } from './stepFixtures.js'

const run = {
  startedAt: new Date('2026-10-09T10:00:00.000Z'),
  createdAt: new Date('2026-10-09T09:59:00.000Z'),
}

describe('deriveState', () => {
  it('reads the run input from the first step', () => {
    expect(inputOf([inputStep()])?.messages[0]?.text).toBe('Refund order 1182')
    expect(inputOf([])).toBeUndefined()
  })

  it('has no turn before the first model answer', () => {
    const state = deriveState(run, [inputStep()])
    expect(state?.turn).toBeUndefined()
    expect(state?.nextSeq).toBe(2)
    expect(state?.turns).toBe(0)
  })

  it('groups the steps of a call under the model answer that asked for it', () => {
    const state = deriveState(run, [
      inputStep(),
      modelStep(2, { text: '', toolCalls: [call('c1'), call('c2', 'lookup_api')] }),
      decisionStep(3, 'c1'),
      guardStep(4, 'c1', guardResult('auto')),
      toolStep(5, 'c1'),
    ])
    expect(state?.turns).toBe(1)
    const [first, second] = state?.turn?.calls ?? []
    expect(first).toMatchObject({ id: 'c1' })
    expect(first?.decision?.seq).toBe(3)
    expect(first?.guardResult?.outcome).toBe('auto')
    expect(first?.tool?.seq).toBe(5)
    expect(second).toMatchObject({ id: 'c2', tool: undefined, guard: undefined })
  })

  it('does not count the input step or reused copies as turns', () => {
    const copied = {
      ...modelStep(2, { text: 'earlier', toolCalls: [] }),
      status: 'skipped' as const,
    }
    const state = deriveState(run, [inputStep(), copied])
    expect(state?.turns).toBe(0)
    expect(state?.turn?.text).toBe('earlier')
  })

  it('starts a new stretch at the newest resolving approval step', () => {
    const waiting = approvalWaiting(5, 'c1', 'a1')
    const closed = {
      ...approvalClosed(8, 'c1', 'a1', 'approved'),
      createdAt: new Date('2026-10-09T12:00:00.000Z'),
    }
    expect(stretchStart(run, [inputStep(), waiting]).toISOString()).toBe('2026-10-09T10:00:00.000Z')
    expect(stretchStart(run, [inputStep(), waiting, closed]).toISOString()).toBe(
      '2026-10-09T12:00:00.000Z',
    )
  })
})

describe('planCall', () => {
  const calls = (steps: ReturnType<typeof step>[]): CallState => {
    const found = deriveState(run, [
      inputStep(),
      modelStep(2, { text: '', toolCalls: [call('c1')] }),
      ...steps,
    ])?.turn?.calls[0]
    if (found === undefined) throw new Error('no call in the state')
    return found
  }

  it('decides, then checks, for a tool that acts', () => {
    expect(planCall(calls([]), { permission: 'can_act', approvalResolved: false })).toBe('decide')
    expect(
      planCall(calls([decisionStep(3, 'c1')]), { permission: 'can_act', approvalResolved: false }),
    ).toBe('guard')
  })

  it('skips the decision for a read-only tool', () => {
    expect(planCall(calls([]), { permission: 'read_only', approvalResolved: false })).toBe('guard')
  })

  it('answers a tool that does not exist without running anything', () => {
    expect(planCall(calls([]), { permission: undefined, approvalResolved: false })).toBe(
      'record_blocked',
    )
  })

  it('runs the bands that allow it and records a block', () => {
    for (const outcome of ['auto', 'double_check'] as const) {
      const planned = calls([guardStep(3, 'c1', guardResult(outcome))])
      expect(planCall(planned, { permission: 'read_only', approvalResolved: false })).toBe(
        'execute',
      )
    }
    const blocked = calls([guardStep(3, 'c1', guardResult('blocked'))])
    expect(planCall(blocked, { permission: 'can_act', approvalResolved: false })).toBe(
      'record_blocked',
    )
  })

  it('asks a person, waits, resolves and then runs or rejects', () => {
    const human = guardStep(3, 'c1', guardResult('human', 'a1'))
    const asked = calls([human])
    expect(planCall(asked, { permission: 'ask_first', approvalResolved: false })).toBe(
      'request_approval',
    )
    const waiting = calls([human, approvalWaiting(4, 'c1', 'a1')])
    expect(planCall(waiting, { permission: 'ask_first', approvalResolved: false })).toBe(
      'await_approval',
    )
    expect(planCall(waiting, { permission: 'ask_first', approvalResolved: true })).toBe(
      'resolve_approval',
    )
    for (const outcome of ['approved', 'approved_with_edits', 'timed_out_continued'] as const) {
      const closed = calls([
        human,
        approvalWaiting(4, 'c1', 'a1'),
        approvalClosed(5, 'c1', 'a1', outcome),
      ])
      expect(planCall(closed, { permission: 'ask_first', approvalResolved: true })).toBe('execute')
    }
    for (const outcome of ['rejected', 'timed_out_rejected'] as const) {
      const closed = calls([
        human,
        approvalWaiting(4, 'c1', 'a1'),
        approvalClosed(5, 'c1', 'a1', outcome),
      ])
      expect(planCall(closed, { permission: 'ask_first', approvalResolved: true })).toBe(
        'record_rejected',
      )
    }
  })

  it('is done once its tool step exists', () => {
    const done = calls([guardStep(3, 'c1', guardResult('auto')), toolStep(4, 'c1')])
    expect(planCall(done, { permission: 'read_only', approvalResolved: false })).toBe('done')
  })

  it('runs an approved call with the approver’s edits', () => {
    const edited = calls([
      guardStep(3, 'c1', guardResult('human', 'a1')),
      approvalWaiting(4, 'c1', 'a1'),
      approvalClosed(5, 'c1', 'a1', 'approved_with_edits', { amount: 120 }),
    ])
    expect(argumentsOf(edited)).toEqual({ amount: 120 })
    const plain = calls([])
    expect(argumentsOf(plain)).toEqual({ amount: 340 })
  })
})
