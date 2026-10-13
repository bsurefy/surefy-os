// SPDX-License-Identifier: AGPL-3.0-only
import type { AgentRunSummary, DataLocation, GuardOutcome } from '@surefy/contracts'

import { OUTCOME_MAX } from './agentRuns.constants.js'

import type { StepRow } from './agentRuns.types.js'

/** The finished run in numbers and names: no prompts, no tool results (database/agents-and-runs.md, §5). */
export function summarize(steps: readonly StepRow[], outcome: string): AgentRunSummary {
  const tools = new Set<string>()
  const guardChecks: Partial<Record<GuardOutcome, number>> = {}
  const approvalIds = new Set<string>()
  const locations = new Set<DataLocation>()
  let sources = 0
  for (const step of steps) {
    if (step.type === 'tool' && step.status === 'succeeded') tools.add(step.name)
    if (step.type === 'guard' && step.guardBand !== null) {
      guardChecks[step.guardBand] = (guardChecks[step.guardBand] ?? 0) + 1
    }
    if (step.approvalId !== null) approvalIds.add(step.approvalId)
    if (step.dataLocation !== null) locations.add(step.dataLocation)
    if (
      step.type === 'retrieval' &&
      step.output?.kind === 'retrieval' &&
      step.status !== 'skipped'
    ) {
      sources += step.output.passages?.length ?? 0
    }
  }
  return {
    version: 1,
    outcome: outcome.slice(0, OUTCOME_MAX),
    toolsUsed: [...tools].slice(0, 50),
    sourcesCount: sources,
    guardChecks,
    approvalIds: [...approvalIds].slice(0, 100),
    dataLocations: [...locations],
  }
}

/** One sentence for the run detail header. */
export function outcomeSentence(
  status: 'succeeded' | 'failed' | 'canceled' | 'timed_out',
  errorCode: string | null,
  steps: readonly StepRow[],
): string {
  const tools = new Set(
    steps.filter((s) => s.type === 'tool' && s.status === 'succeeded').map((s) => s.name),
  )
  switch (status) {
    case 'succeeded': {
      if (tools.size === 0) return 'Answered the question.'
      const more = tools.size > 3 ? ' and more' : ''
      return `Answered after using ${[...tools].slice(0, 3).join(', ')}${more}.`
    }
    case 'failed': {
      const code = errorCode === null ? '' : ` (${errorCode})`
      return `The run failed${code}.`
    }
    case 'timed_out':
      return 'The run took too long and was stopped.'
    case 'canceled':
      return 'The run was canceled.'
  }
}
