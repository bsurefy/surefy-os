// SPDX-License-Identifier: AGPL-3.0-only
import { AGENT_RUN_ACTIVE_STATUSES, GUARD_OUTCOMES } from '@surefy/contracts'
import type {
  AgentRunStatus,
  AgentRunStepDto,
  AgentRunSummary,
  GuardOutcome,
} from '@surefy/contracts'
import type { ErrorMessageKey, ErrorsTranslator } from '@surefy/web-core/errors'

import { MIN_BAR_SHARE } from './RunDetail.constants'

/** Queued, running or waiting for an approval: the run can still change. */
export const isRunOpen = (status: AgentRunStatus | undefined): boolean =>
  status !== undefined && (AGENT_RUN_ACTIVE_STATUSES as readonly string[]).includes(status)

/** Where a step sits on the run's timeline, as shares of the whole run. */
export interface WaterfallBar {
  offset: number
  width: number
}

/**
 * The waterfall: each step's start and length as shares of the time from the first step's start
 * to the last step's end; a step still open ends at `now`.
 */
export function toWaterfall(
  steps: readonly AgentRunStepDto[],
  now: number,
): Map<number, WaterfallBar> {
  const bars = new Map<number, WaterfallBar>()
  if (steps.length === 0) return bars
  const startOf = (step: AgentRunStepDto) => Date.parse(step.startedAt)
  const endOf = (step: AgentRunStepDto) =>
    step.finishedAt ? Date.parse(step.finishedAt) : Math.max(now, startOf(step))
  const first = Math.min(...steps.map(startOf))
  const span = Math.max(Math.max(...steps.map(endOf)) - first, 1)
  for (const step of steps) {
    const offset = Math.min((startOf(step) - first) / span, 1 - MIN_BAR_SHARE)
    const width = Math.max((endOf(step) - startOf(step)) / span, MIN_BAR_SHARE)
    bars.set(step.seq, { offset, width: Math.min(width, 1 - offset) })
  }
  return bars
}

/** The steps that asked a person or recorded a decision, in order: the approval history. */
export const approvalSteps = (steps: readonly AgentRunStepDto[]): AgentRunStepDto[] =>
  steps.filter((step) => step.approvalId !== null)

/** The Guard outcomes the run met, strictest last, with how many checks had each. */
export function guardCheckRows(
  summary: AgentRunSummary | null,
): { outcome: GuardOutcome; count: number }[] {
  if (!summary) return []
  return GUARD_OUTCOMES.flatMap((outcome) => {
    const count = summary.guardChecks[outcome] ?? 0
    return count > 0 ? [{ outcome, count }] : []
  })
}

/** What an API error code of a run or a step says; the generic text for a code without one. */
export function getRunErrorMessage(code: string | null, t: ErrorsTranslator): string {
  const key = code as ErrorMessageKey | null
  return key && t.has(key) ? t(key) : t('fallback')
}

/** Totals of the steps for the waterfall's header. */
export function stepTotals(steps: readonly AgentRunStepDto[]) {
  return {
    count: steps.length,
    tokens: steps.reduce((sum, step) => sum + step.inputTokens + step.outputTokens, 0),
    costMicros: steps.reduce((sum, step) => sum + step.costMicros, 0),
    currency: steps[0]?.currency ?? 'USD',
  }
}
