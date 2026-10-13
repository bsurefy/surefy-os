// SPDX-License-Identifier: AGPL-3.0-only
import { createEmptyAgentDefinition } from '@surefy/contracts'
import type { AgentRunInput, AgentRunStepData, GuardCheckResult } from '@surefy/contracts'

import type { StepRow } from '../agentRuns.types.js'

const at = new Date('2026-10-09T10:00:00.000Z')
const base = { version: 1, truncated: false } as const

export const RUN_ID = '0198f3a0-0000-7000-8000-0000000000b1'
export const ORG_ID = '0198f3a0-0000-7000-8000-0000000000b2'

/** A step row with the given fields over plausible defaults. */
export function step(seq: number, fields: Partial<StepRow> & Pick<StepRow, 'type'>): StepRow {
  return {
    id: `0198f3a0-0000-7000-8000-${String(seq).padStart(12, '0')}`,
    organizationId: ORG_ID,
    runId: RUN_ID,
    seq,
    name: `step ${seq}`,
    status: 'succeeded',
    input: null,
    output: null,
    modelKey: null,
    inputTokens: 0,
    outputTokens: 0,
    costMicros: 0,
    currency: 'USD',
    confidence: null,
    guardBand: null,
    approvalId: null,
    dataLocation: null,
    errorCode: null,
    startedAt: new Date(at.getTime() + seq * 1000),
    finishedAt: new Date(at.getTime() + seq * 1000 + 100),
    durationMs: 100,
    createdAt: new Date(at.getTime() + seq * 1000),
    ...fields,
  }
}

export const runInput = (text = 'Refund order 1182'): AgentRunInput => ({
  messages: [{ role: 'user', text }],
  channelId: null,
  externalRef: null,
  definitionSnapshot: createEmptyAgentDefinition('openai/gpt-4.1'),
  retryOf: null,
})

/** Step 1: the run's input. */
export const inputStep = (input = runInput()): StepRow =>
  step(1, {
    type: 'model',
    status: 'skipped',
    name: 'Run input',
    input: { ...base, kind: 'model', run: input },
  })

export const modelStep = (
  seq: number,
  output: Extract<AgentRunStepData, { kind: 'model' }> extends infer M
    ? Omit<M & object, 'version' | 'truncated' | 'kind'>
    : never,
): StepRow =>
  step(seq, {
    type: 'model',
    output: { ...base, kind: 'model', ...output },
  })

export const guardResult = (
  outcome: GuardCheckResult['outcome'],
  approvalId: string | null = null,
): GuardCheckResult => ({
  outcome,
  confidence: 0.9,
  thresholds: { autoBp: 9000, reviewBp: 6000 },
  matchedRules: [],
  doubleCheck: null,
  approvalId,
  reasonCode: outcome === 'blocked' ? 'GUARD_BLOCKED_ACTION' : null,
})

export const guardStep = (seq: number, callId: string, result: GuardCheckResult): StepRow =>
  step(seq, {
    type: 'guard',
    status: result.outcome === 'blocked' ? 'blocked' : 'succeeded',
    guardBand: result.outcome,
    approvalId: result.approvalId,
    output: { ...base, kind: 'guard', callId, action: 'refund', result },
  })

export const toolStep = (seq: number, callId: string, result = 'done'): StepRow =>
  step(seq, {
    type: 'tool',
    output: { ...base, kind: 'tool', callId, result, isError: false },
  })

export const decisionStep = (seq: number, callId: string, confidence = 0.9): StepRow =>
  step(seq, {
    type: 'decision',
    confidence,
    output: { ...base, kind: 'decision', callId, value: true, reasoning: 'Looks right' },
  })

export const approvalWaiting = (seq: number, callId: string, approvalId: string): StepRow =>
  step(seq, {
    type: 'approval',
    status: 'waiting',
    approvalId,
    input: { ...base, kind: 'approval', callId },
  })

export const approvalClosed = (
  seq: number,
  callId: string,
  approvalId: string,
  outcome:
    'approved' | 'approved_with_edits' | 'rejected' | 'timed_out_rejected' | 'timed_out_continued',
  editedInput?: Record<string, unknown>,
): StepRow =>
  step(seq, {
    type: 'approval',
    status: outcome === 'rejected' || outcome === 'timed_out_rejected' ? 'skipped' : 'succeeded',
    approvalId,
    output: {
      ...base,
      kind: 'approval',
      callId,
      outcome,
      ...(editedInput === undefined ? {} : { editedInput }),
    },
  })

export const call = (
  id: string,
  name = 'refund_api',
  args: Record<string, unknown> = { amount: 340 },
) => ({
  id,
  name,
  arguments: args,
})
