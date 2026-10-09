// SPDX-License-Identifier: AGPL-3.0-only
import { uuidv7 } from '@/lib/uuidv7.js'
import type {
  AgentRunStepData,
  AgentRunStepStatus,
  AgentRunStepType,
  DataLocation,
  GuardOutcome,
} from '@surefy/contracts'

import { capStepData } from './agentRuns.data.js'
import { AgentRunSupersededError } from './agentRuns.errors.js'
import { stepEvent } from './agentRuns.present.js'

import type { AgentRunsRepository, StepEffects } from './agentRuns.repository.js'
import type { AgentRunsEvents, NewStepRow, StepRow } from './agentRuns.types.js'
import type { Database, DbExecutor } from '@/core/database/index.js'

/** One step as the executor describes it; `seq` and `createdAt` are filled in by the recorder. */
export interface StepSpec {
  type: AgentRunStepType
  name: string
  status: AgentRunStepStatus
  input?: AgentRunStepData | null
  output?: AgentRunStepData | null
  modelKey?: string | null
  inputTokens?: number
  outputTokens?: number
  costMicros?: number
  currency?: string
  confidence?: number | null
  guardBand?: GuardOutcome | null
  approvalId?: string | null
  dataLocation?: DataLocation | null
  errorCode?: string | null
  startedAt: Date
  finishedAt?: Date | null
  effects?: Pick<StepEffects, 'neededHuman' | 'humanCorrected'>
  /** False only for the run's input step, which is the run's state and is never cut. */
  capped?: boolean
}

export interface RecorderDeps {
  db: Database
  repository: AgentRunsRepository
  events: AgentRunsEvents
}

/** The run a recorder writes steps for, and the `seq` of the next one. */
export interface RecordedRun {
  orgId: string
  runId: string
}

/** The input is capped like the output, except the run's own input step. */
function inputData(spec: StepSpec): AgentRunStepData | null {
  if (spec.input === undefined || spec.input === null) return null
  return spec.capped === false ? spec.input : capStepData(spec.input)
}

/** Turns a spec into the row that is inserted: data capped, duration measured. */
export function rowOf(spec: StepSpec, seq: number): Omit<NewStepRow, 'organizationId' | 'runId'> {
  const finishedAt = spec.finishedAt ?? null
  return {
    id: uuidv7(spec.startedAt.getTime()),
    seq,
    type: spec.type,
    name: spec.name.slice(0, 300),
    status: spec.status,
    input: inputData(spec),
    output: spec.output === undefined || spec.output === null ? null : capStepData(spec.output),
    modelKey: spec.modelKey ?? null,
    inputTokens: spec.inputTokens ?? 0,
    outputTokens: spec.outputTokens ?? 0,
    costMicros: spec.costMicros ?? 0,
    currency: spec.currency ?? 'USD',
    confidence: spec.confidence ?? null,
    guardBand: spec.guardBand ?? null,
    approvalId: spec.approvalId ?? null,
    dataLocation: spec.dataLocation ?? null,
    errorCode: spec.errorCode ?? null,
    startedAt: spec.startedAt,
    finishedAt,
    durationMs:
      finishedAt === null ? null : Math.max(0, finishedAt.getTime() - spec.startedAt.getTime()),
    createdAt: spec.startedAt,
  }
}

/**
 * Persists steps (backend/agent-runs.md, §4, "Persist after every step"): the step row and the
 * run's counters in one transaction, conditional on the run still being `running` at the step
 * the executor read. A cancel, a timeout or a second executor makes the write fail with
 * `AgentRunSupersededError`, so a stopped run never gains a step.
 */
export class StepRecorder {
  constructor(private readonly deps: RecorderDeps) {}

  /** Writes one step in its own transaction and publishes `data-step`. Returns the stored row. */
  async record(
    run: RecordedRun,
    seq: number,
    spec: StepSpec,
    alongside?: (tx: DbExecutor) => Promise<void>,
  ): Promise<StepRow> {
    const stored = await this.deps.db.tenant(run.orgId, async (tx) => {
      const row = await this.recordIn(tx, run, seq, spec)
      if (alongside !== undefined) await alongside(tx)
      return row
    })
    await this.publish(run, stored)
    return stored
  }

  /** Writes one step in the caller's transaction (several steps, or a step with a status change). */
  async recordIn(
    tx: DbExecutor,
    run: RecordedRun,
    seq: number,
    spec: StepSpec,
    options?: { requireRunning: boolean },
  ): Promise<StepRow> {
    const values = rowOf(spec, seq)
    const written = await this.deps.repository.appendStep(
      tx,
      run.orgId,
      run.runId,
      values,
      {
        inputTokens: spec.inputTokens,
        outputTokens: spec.outputTokens,
        costMicros: spec.costMicros,
        confidence: spec.confidence,
        modelKey: spec.type === 'model' ? spec.modelKey : undefined,
        ...spec.effects,
      },
      options,
    )
    if (written === undefined) throw new AgentRunSupersededError()
    return written
  }

  /** Publishes the step as the waterfall draws it. */
  async publish(run: RecordedRun, step: StepRow): Promise<void> {
    await this.deps.events.publish(run.orgId, run.runId, {
      type: 'data-step',
      data: stepEvent(step),
    })
  }
}
