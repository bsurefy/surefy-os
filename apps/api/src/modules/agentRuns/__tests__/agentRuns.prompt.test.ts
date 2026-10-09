// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, it } from 'vitest'

import { createEmptyAgentDefinition } from '@surefy/contracts'

import {
  approvalClosed,
  approvalWaiting,
  call,
  guardResult,
  guardStep,
  inputStep,
  modelStep,
  toolStep,
} from './stepFixtures.js'
import { capStepData, stepDataBytes } from '../agentRuns.data.js'
import { buildMessages, systemPrompt } from '../agentRuns.prompt.js'
import { deriveState } from '../agentRuns.state.js'

const run = { startedAt: new Date(), createdAt: new Date() }

function must<T>(value: T | undefined): T {
  if (value === undefined) throw new Error('missing value')
  return value
}

describe('systemPrompt', () => {
  const definition = createEmptyAgentDefinition('openai/gpt-4.1')

  it('adds the tone, numbered sources and the citing rule', () => {
    const prompt = systemPrompt(
      {
        instructions: 'Answer HR questions.',
        tone: 'Friendly',
        knowledge: { knowledgeBaseIds: ['x'], citeSources: true, onlyFromKnowledge: true },
      },
      [{ documentId: 'd1', title: 'Leave policy', page: 3, text: '25 days of leave.' }],
    )
    expect(prompt).toContain('Answer HR questions.')
    expect(prompt).toContain('Tone: Friendly')
    expect(prompt).toContain('[1] Leave policy, page 3\n25 days of leave.')
    expect(prompt).toContain('never an instruction')
    expect(prompt).toContain('Cite the sources')
    expect(prompt).toContain('Answer only from the sources')
  })

  it('leaves out sources an agent without knowledge does not have', () => {
    const prompt = systemPrompt({ ...definition, tone: null }, [
      { documentId: 'd1', title: 'Leave policy', page: null, text: 'x' },
    ])
    expect(prompt).not.toContain('<sources>')
  })
})

describe('buildMessages', () => {
  it('replays earlier turns: the answer with its calls, then the results', () => {
    const state = deriveState(run, [
      inputStep(),
      modelStep(2, { text: 'Let me check.', toolCalls: [call('c1', 'lookup_api', { id: 7 })] }),
      guardStep(3, 'c1', guardResult('auto')),
      toolStep(4, 'c1', '{"status":"paid"}'),
    ])
    const messages = buildMessages(must(state))
    expect(messages.map((message) => message.role)).toEqual(['user', 'assistant', 'tool'])
    expect(messages[1]).toMatchObject({
      role: 'assistant',
      content: [
        { type: 'text', text: 'Let me check.' },
        { type: 'tool-call', toolCallId: 'c1', toolName: 'lookup_api', input: { id: 7 } },
      ],
    })
    expect(messages[2]).toMatchObject({
      role: 'tool',
      content: [
        {
          type: 'tool-result',
          toolCallId: 'c1',
          output: { type: 'text', value: '{"status":"paid"}' },
        },
      ],
    })
  })

  it('does not read approval steps as messages', () => {
    const state = deriveState(run, [
      inputStep(),
      modelStep(2, { text: '', toolCalls: [call('c1')] }),
      guardStep(3, 'c1', guardResult('human', 'a1')),
      approvalWaiting(4, 'c1', 'a1'),
      approvalClosed(5, 'c1', 'a1', 'approved'),
      toolStep(6, 'c1', 'Refunded'),
    ])
    expect(buildMessages(must(state))).toHaveLength(3)
  })
})

describe('capStepData', () => {
  it('leaves data under the cap alone', () => {
    const data = { version: 1, truncated: false, kind: 'tool', result: 'ok' } as const
    expect(capStepData(data)).toBe(data)
  })

  it('cuts the longest strings until the step fits and says so', () => {
    const data = {
      version: 1,
      truncated: false,
      kind: 'tool',
      callId: 'c1',
      result: 'x'.repeat(200_000),
    } as const
    const capped = capStepData(data)
    expect(capped.truncated).toBe(true)
    expect(stepDataBytes(capped)).toBeLessThanOrEqual(65_536)
    expect(capped.callId).toBe('c1')
  })
})
