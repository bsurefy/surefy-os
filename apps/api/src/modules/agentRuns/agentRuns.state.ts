// SPDX-License-Identifier: AGPL-3.0-only
import { AGENT_RUN_MAX_SECONDS } from '@surefy/contracts'
import type { AgentRunInput, AgentRunStepData, GuardCheckResult } from '@surefy/contracts'

import type { RunRow, StepRow } from './agentRuns.types.js'

// The steps are the whole state of a run (backend/agent-runs.md, §2, §4): every decision the
// executor makes is derived from them here, so a worker that takes over after a crash, a resume
// after an approval and a retry all continue from the same rows. Pure functions, no I/O.

type Data<K extends AgentRunStepData['kind']> = Extract<AgentRunStepData, { kind: K }>

const dataOf = <K extends AgentRunStepData['kind']>(
  data: AgentRunStepData | null,
  kind: K,
): Data<K> | undefined => (data?.kind === kind ? (data as Data<K>) : undefined)

/** The model's call, with the steps that belong to it. A call is complete when its `tool` step exists. */
export interface CallState {
  /** The model's id of the call. */
  id: string
  /** The function name the model used. */
  name: string
  arguments: Record<string, unknown>
  decision: StepRow | undefined
  guard: StepRow | undefined
  /** The result of Guard's check, when it was made. */
  guardResult: GuardCheckResult | undefined
  /** The approval steps of the call in order: the waiting row, then its resolution. */
  approvals: StepRow[]
  /** The approval Guard created for the call. */
  approvalId: string | null
  tool: StepRow | undefined
}

/** The turn in progress: the last model answer and what became of its tool calls. */
export interface TurnState {
  model: StepRow
  text: string
  calls: CallState[]
}

export interface RunState {
  /** The run's own input: the first step. */
  input: AgentRunInput
  steps: StepRow[]
  /** The next step's `seq`. */
  nextSeq: number
  /** The knowledge search was made (it may have found nothing). */
  retrieval: { step: StepRow; passages: NonNullable<Data<'retrieval'>['passages']> } | undefined
  /** Model calls this run made. */
  turns: number
  /** The last model answer; undefined before the first call. */
  turn: TurnState | undefined
  /** When the current stretch of active execution started (the limit counts from here). */
  stretchStartedAt: Date
}

const isInputStep = (step: StepRow): boolean => step.seq === 1

/** The run's input step, written when the run starts. */
export function inputOf(steps: readonly StepRow[]): AgentRunInput | undefined {
  const first = steps.find(isInputStep)
  const data = first?.input
  if (data?.kind === 'model' || data?.kind === 'retrieval') return data.run
  return undefined
}

const isCopied = (step: StepRow): boolean => step.status === 'skipped' && !isInputStep(step)

/** A model step that counts as a turn: one this run made, not the input step or a reused copy. */
const isTurn = (step: StepRow): boolean =>
  step.type === 'model' && !isInputStep(step) && !isCopied(step) && step.status === 'succeeded'

const callsOf = (model: StepRow, steps: readonly StepRow[]): CallState[] => {
  const output = dataOf(model.output, 'model')
  return (output?.toolCalls ?? []).map((call) => {
    const mine = steps.filter((step) => step.seq > model.seq && callIdOf(step) === call.id)
    const guard = mine.find((step) => step.type === 'guard')
    const guardData = dataOf(guard?.output ?? null, 'guard')
    const approvals = mine.filter((step) => step.type === 'approval')
    return {
      id: call.id,
      name: call.name,
      arguments: call.arguments,
      decision: mine.find((step) => step.type === 'decision'),
      guard,
      guardResult: guardData?.result,
      approvals,
      approvalId:
        guardData?.result?.approvalId ?? approvals.find((a) => a.approvalId)?.approvalId ?? null,
      tool: mine.find((step) => step.type === 'tool'),
    }
  })
}

/** The `callId` a decision, Guard, approval or tool step carries. */
export function callIdOf(step: StepRow): string | undefined {
  const data = step.output ?? step.input
  if (
    data?.kind === 'decision' ||
    data?.kind === 'guard' ||
    data?.kind === 'approval' ||
    data?.kind === 'tool'
  ) {
    return data.callId
  }
  return undefined
}

/** Reads a run's steps into what the executor needs to decide its next move. */
export function deriveState(
  run: Pick<RunRow, 'startedAt' | 'createdAt'>,
  steps: readonly StepRow[],
): RunState | undefined {
  const input = inputOf(steps)
  if (input === undefined) return undefined
  const retrievalStep = steps.find((step) => step.type === 'retrieval' && !isInputStep(step))
  const retrievalOutput = dataOf(retrievalStep?.output ?? null, 'retrieval')
  const models = steps.filter(
    (step) => step.type === 'model' && !isInputStep(step) && step.status !== 'failed',
  )
  const last = [...models].reverse()[0]
  const lastOutput = dataOf(last?.output ?? null, 'model')
  return {
    input,
    steps: [...steps],
    nextSeq: (steps.at(-1)?.seq ?? 0) + 1,
    retrieval:
      retrievalStep === undefined
        ? undefined
        : { step: retrievalStep, passages: retrievalOutput?.passages ?? [] },
    turns: steps.filter(isTurn).length,
    turn:
      last === undefined
        ? undefined
        : { model: last, text: lastOutput?.text ?? '', calls: callsOf(last, steps) },
    stretchStartedAt: stretchStart(run, steps),
  }
}

/** A stretch starts at `started_at` or at the newest resolving approval step. */
export function stretchStart(
  run: Pick<RunRow, 'startedAt' | 'createdAt'>,
  steps: readonly StepRow[],
): Date {
  const resolutions = steps
    .filter((step) => step.type === 'approval' && step.status !== 'waiting')
    .map((step) => step.createdAt.getTime())
  const started = (run.startedAt ?? run.createdAt).getTime()
  return new Date(Math.max(started, ...resolutions))
}

/** Seconds of active execution in the current stretch. */
export const stretchSeconds = (state: Pick<RunState, 'stretchStartedAt'>, now: Date): number =>
  (now.getTime() - state.stretchStartedAt.getTime()) / 1000

export const stretchExceeded = (state: Pick<RunState, 'stretchStartedAt'>, now: Date): boolean =>
  stretchSeconds(state, now) > AGENT_RUN_MAX_SECONDS

// ---- What the next move is ----------------------------------------------------------------

/** What a call still needs, in the order the executor does it (backend/agent-runs.md, §4). */
export type CallNeed =
  | 'decide'
  | 'guard'
  | 'execute'
  | 'record_blocked'
  | 'request_approval'
  | 'await_approval'
  | 'resolve_approval'
  | 'record_rejected'
  | 'done'

type ApprovalData = Data<'approval'>

/** The row that closed the call's approval: the one with an outcome. */
export function resolutionRow(call: CallState): { step: StepRow; data: ApprovalData } | undefined {
  for (const step of call.approvals) {
    const data = dataOf(step.output, 'approval')
    if (data?.outcome !== undefined) return { step, data }
  }
  return undefined
}

/** Outcomes that let the action run. */
export const RUNS_ACTION = ['approved', 'approved_with_edits', 'timed_out_continued'] as const

/** `read_only` calls skip the decision; every other call is judged first. */
export const needsDecision = (permission: string): boolean => permission !== 'read_only'

/**
 * What one call needs next. `permission` is the tool's (undefined for a tool that does not
 * exist); `approvalResolved` says whether the approval Guard created has been decided.
 */
export function planCall(
  call: CallState,
  options: { permission: string | undefined; approvalResolved: boolean },
): CallNeed {
  if (call.tool !== undefined) return 'done'
  if (options.permission === undefined) return 'record_blocked'
  if (call.guard === undefined) {
    return call.decision === undefined && needsDecision(options.permission) ? 'decide' : 'guard'
  }
  const outcome = call.guardResult?.outcome
  if (outcome === 'blocked') return 'record_blocked'
  if (outcome === 'auto' || outcome === 'double_check') return 'execute'
  // a person decides
  if (call.approvals.length === 0) return 'request_approval'
  const closed = resolutionRow(call)
  if (closed === undefined) return options.approvalResolved ? 'resolve_approval' : 'await_approval'
  const runs = (RUNS_ACTION as readonly string[]).includes(closed.data.outcome ?? '')
  return runs ? 'execute' : 'record_rejected'
}

/** The run's answer: the text of the last model step when it made no tool call. */
export function finalAnswer(state: RunState): string | undefined {
  const turn = state.turn
  return turn?.calls.length === 0 ? turn.text : undefined
}

/** The arguments an approved call runs with: the approver's edits, else the model's. */
export function argumentsOf(call: CallState): Record<string, unknown> {
  const closed = resolutionRow(call)
  return closed?.data.outcome === 'approved_with_edits' && closed.data.editedInput !== undefined
    ? closed.data.editedInput
    : call.arguments
}
