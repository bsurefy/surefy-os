// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, it } from 'vitest'

import type { AgentRunStepEvent } from '@surefy/contracts'
import { fixtureUuid } from '@surefy/web-core/testing'

import { EMPTY_TRACE } from './TestTab.constants'
import {
  applyRunEvent,
  barShare,
  findFailedToolStep,
  getActivity,
  isRunOpen,
  longestStepMs,
  startedTrace,
  toRunMessages,
  totalsOf,
} from './TestTab.utils'

import type { TestUiMessage } from './TestTab.types'

const RUN_ID = fixtureUuid(75, 1)

function step(seq: number, overrides: Partial<AgentRunStepEvent> = {}): AgentRunStepEvent {
  return {
    id: fixtureUuid(76, seq),
    seq,
    type: 'model',
    name: 'GPT-4.1',
    status: 'succeeded',
    modelKey: 'openai/gpt-4.1',
    inputTokens: 100,
    outputTokens: 20,
    costMicros: 1500,
    currency: 'USD',
    confidence: null,
    guardBand: null,
    approvalId: null,
    dataLocation: null,
    errorCode: null,
    startedAt: '2026-01-15T09:00:00.000Z',
    finishedAt: '2026-01-15T09:00:01.000Z',
    durationMs: 1000,
    ...overrides,
  }
}

const message = (role: 'user' | 'assistant', ...texts: string[]): TestUiMessage => ({
  id: `${role}-${texts.join('')}`,
  role,
  parts: texts.map((text) => ({ type: 'text', text })),
})

describe('toRunMessages', () => {
  it('turns the conversation into the messages a run starts from', () => {
    const messages = [message('user', 'Hi'), message('assistant', 'Hello', ' there')]
    expect(toRunMessages(messages)).toEqual([
      { role: 'user', text: 'Hi' },
      { role: 'assistant', text: 'Hello there' },
    ])
  })

  it('leaves out messages without text', () => {
    const empty: TestUiMessage = { id: 'a', role: 'assistant', parts: [] }
    expect(toRunMessages([message('user', 'Hi'), empty])).toHaveLength(1)
  })

  it('keeps the latest messages of a long conversation', () => {
    const messages = Array.from({ length: 60 }, (_, index) => message('user', `m${index}`))
    const sent = toRunMessages(messages)
    expect(sent).toHaveLength(50)
    expect(sent.at(-1)?.text).toBe('m59')
  })
})

describe('applyRunEvent', () => {
  it('takes the status of the run', () => {
    const trace = applyRunEvent(EMPTY_TRACE, {
      type: 'data-run',
      data: { runId: RUN_ID, status: 'running', errorCode: null },
    })
    expect(trace).toMatchObject({ runId: RUN_ID, status: 'running' })
  })

  it('adds steps in order and replaces a step that changed', () => {
    const waiting = step(2, { status: 'waiting' })
    let trace = applyRunEvent(EMPTY_TRACE, { type: 'data-step', data: step(1) })
    trace = applyRunEvent(trace, { type: 'data-step', data: waiting })
    trace = applyRunEvent(trace, { type: 'data-step', data: step(2, { status: 'succeeded' }) })
    expect(trace.steps.map(({ seq, status }) => [seq, status])).toEqual([
      [1, 'succeeded'],
      [2, 'succeeded'],
    ])
  })

  it('remembers the approval a waiting step asks for', () => {
    const data = {
      seq: 3,
      approvalId: fixtureUuid(77, 1),
      title: 'Refund',
      assignees: [],
      expiresAt: null,
    }
    const trace = applyRunEvent(EMPTY_TRACE, { type: 'data-approval-required', data })
    expect(trace.approvals[3]?.approvalId).toBe(data.approvalId)
  })

  it('ignores chunks it does not show and data that does not fit', () => {
    expect(applyRunEvent(EMPTY_TRACE, { type: 'data-usage', data: {} })).toBe(EMPTY_TRACE)
    expect(applyRunEvent(EMPTY_TRACE, { type: 'data-step', data: { seq: 'x' } })).toBe(EMPTY_TRACE)
  })
})

describe('the trace', () => {
  it('starts queued when the run is known and empty when it is not', () => {
    expect(startedTrace(RUN_ID)).toMatchObject({ runId: RUN_ID, status: 'queued', steps: [] })
    expect(startedTrace()).toEqual(EMPTY_TRACE)
  })

  it('knows which statuses are still open', () => {
    expect(isRunOpen('running')).toBe(true)
    expect(isRunOpen('waiting_approval')).toBe(true)
    expect(isRunOpen('failed')).toBe(false)
    expect(isRunOpen(null)).toBe(false)
  })

  it('finds the failed tool step, not other failures', () => {
    const steps = [
      step(1, { type: 'model', status: 'failed' }),
      step(2, { type: 'tool', status: 'failed' }),
    ]
    expect(findFailedToolStep(steps)?.seq).toBe(2)
    expect(findFailedToolStep([step(1)])).toBeUndefined()
  })

  it('sizes the waterfall bars against the longest step', () => {
    const steps = [step(1, { durationMs: 200 }), step(2, { durationMs: 800 })]
    expect(longestStepMs(steps)).toBe(800)
    expect(barShare(200, 800)).toBe(0.25)
    expect(barShare(null, 800)).toBe(0)
    expect(barShare(100, 0)).toBe(0)
  })

  it('adds up the time, tokens and cost of the steps', () => {
    expect(totalsOf([step(1), step(2)])).toEqual({
      count: 2,
      durationMs: 2000,
      tokens: 240,
      costMicros: 3000,
      currency: 'USD',
    })
  })

  it('tells what the conversation is doing from the chat status', () => {
    expect(getActivity('submitted')).toBe('starting')
    expect(getActivity('streaming')).toBe('running')
    expect(getActivity('ready')).toBe('idle')
    expect(getActivity('error')).toBe('idle')
  })
})
