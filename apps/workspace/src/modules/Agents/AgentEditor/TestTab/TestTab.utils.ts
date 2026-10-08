// SPDX-License-Identifier: AGPL-3.0-only
import {
  agentRunApprovalDataSchema,
  agentRunStatusDataSchema,
  agentRunStepEventSchema,
  AGENT_RUN_ACTIVE_STATUSES,
  AGENT_RUN_INPUT_MESSAGES_MAX,
} from '@surefy/contracts'
import type { AgentRunMessage, AgentRunStatus, AgentRunStepEvent } from '@surefy/contracts'
import type { ErrorMessageKey, ErrorsTranslator } from '@surefy/web-core/errors'

import { BASIS_POINTS, EMPTY_TRACE } from './TestTab.constants'

import type { RunDataChunk, RunTrace, TestActivity, TestUiMessage } from './TestTab.types'

const textOf = (message: TestUiMessage) =>
  message.parts
    .flatMap((part) => (part.type === 'text' ? [part.text] : []))
    .join('')
    .trim()

/** The conversation as a run starts from it: the messages with text, the latest ones when it is long. */
export function toRunMessages(messages: readonly TestUiMessage[]): AgentRunMessage[] {
  return messages
    .flatMap((message) => {
      const text = textOf(message)
      return text === '' || (message.role !== 'user' && message.role !== 'assistant')
        ? []
        : [{ role: message.role, text }]
    })
    .slice(-AGENT_RUN_INPUT_MESSAGES_MAX)
}

/** A step replaces the one with the same number, so a step that changes (an approval, a retry) updates in place. */
const withStep = (steps: AgentRunStepEvent[], step: AgentRunStepEvent) => {
  const found = steps.some((existing) => existing.seq === step.seq)
  const next = found
    ? steps.map((existing) => (existing.seq === step.seq ? step : existing))
    : [...steps, step]
  return next.toSorted((a, b) => a.seq - b.seq)
}

/** One event of the run's stream applied to the trace; chunks the trace does not show leave it as it is. */
export function applyRunEvent(trace: RunTrace, chunk: RunDataChunk): RunTrace {
  if (chunk.type === 'data-run') {
    const run = agentRunStatusDataSchema.safeParse(chunk.data)
    if (!run.success) return trace
    return {
      ...trace,
      runId: run.data.runId,
      status: run.data.status,
      errorCode: run.data.errorCode,
    }
  }
  if (chunk.type === 'data-step') {
    const step = agentRunStepEventSchema.safeParse(chunk.data)
    return step.success ? { ...trace, steps: withStep(trace.steps, step.data) } : trace
  }
  if (chunk.type === 'data-approval-required') {
    const approval = agentRunApprovalDataSchema.safeParse(chunk.data)
    return approval.success
      ? { ...trace, approvals: { ...trace.approvals, [approval.data.seq]: approval.data } }
      : trace
  }
  return trace
}

/** A run that was just started or retried, before its first event arrives. */
export const startedTrace = (runId: string | null = null): RunTrace => ({
  ...EMPTY_TRACE,
  runId,
  status: runId ? 'queued' : null,
})

export const isRunOpen = (status: AgentRunStatus | null): boolean =>
  status !== null && (AGENT_RUN_ACTIVE_STATUSES as readonly string[]).includes(status)

/** The step "Retry step" can run again: a tool call that failed. */
export const findFailedToolStep = (steps: readonly AgentRunStepEvent[]) =>
  steps.find((step) => step.type === 'tool' && step.status === 'failed')

/** The step number the longest bar in the waterfall stands for. */
export const longestStepMs = (steps: readonly AgentRunStepEvent[]): number =>
  Math.max(0, ...steps.map((step) => step.durationMs ?? 0))

/** Share of the longest step, 0 to 1, for the bar under a step. */
export const barShare = (durationMs: number | null, longestMs: number): number =>
  durationMs === null || longestMs === 0 ? 0 : Math.min(1, durationMs / longestMs)

/** What the conversation is doing, from the chat's status. */
export function getActivity(status: string): TestActivity {
  if (status === 'submitted') return 'starting'
  return status === 'streaming' ? 'running' : 'idle'
}

export const basisPointsToShare = (bp: number): number => bp / BASIS_POINTS

/** Totals of the trace for the header: time, tokens and cost of the steps so far. */
export function totalsOf(steps: readonly AgentRunStepEvent[]) {
  return {
    count: steps.length,
    durationMs: steps.reduce((sum, step) => sum + (step.durationMs ?? 0), 0),
    tokens: steps.reduce((sum, step) => sum + step.inputTokens + step.outputTokens, 0),
    costMicros: steps.reduce((sum, step) => sum + step.costMicros, 0),
    currency: steps[0]?.currency ?? 'USD',
  }
}

/** What an API error code of a run or a step says; the generic text for a code without one. */
export function getRunErrorMessage(code: string | null, t: ErrorsTranslator): string {
  const key = code as ErrorMessageKey | null
  return key && t.has(key) ? t(key) : t('fallback')
}
