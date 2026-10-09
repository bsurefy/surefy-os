// SPDX-License-Identifier: AGPL-3.0-only
import type {
  AgentChannelType,
  AgentRunDetailDto,
  AgentRunDto,
  AgentRunStepDetailDto,
  AgentRunStepDto,
  DataLocation,
  ModelRefDto,
  PublicRunDto,
  PublicRunOutput,
  UserRefDto,
} from '@surefy/contracts'

import { inputOf } from './agentRuns.state.js'
import { isActiveStatus } from './agentRuns.types.js'

import type { RunRow, StepRow } from './agentRuns.types.js'

/** The step as the waterfall draws it: the row without its data. */
export function stepEvent(step: StepRow): AgentRunStepDto {
  return {
    id: step.id,
    seq: step.seq,
    type: step.type,
    name: step.name,
    status: step.status,
    modelKey: step.modelKey,
    inputTokens: step.inputTokens,
    outputTokens: step.outputTokens,
    costMicros: step.costMicros,
    currency: step.currency,
    confidence: step.confidence,
    guardBand: step.guardBand,
    approvalId: step.approvalId,
    dataLocation: step.dataLocation,
    errorCode: step.errorCode,
    startedAt: step.startedAt.toISOString(),
    finishedAt: step.finishedAt?.toISOString() ?? null,
    durationMs: step.durationMs,
  }
}

/** The shape of a run row once its display data is joined: what the DTOs need. */
export interface RunView {
  run: RunRow
  agentName: string
  agentDeleted: boolean
  agentVersion: number | null
  channelType: AgentChannelType | null
  canEdit: boolean
}

export interface RunLookups {
  users: ReadonlyMap<string, UserRefDto>
  models: ReadonlyMap<string, ModelRefDto>
}

const iso = (date: Date | null): string | null => date?.toISOString() ?? null

/** A run as the Insights table and an agent's Runs tab show it. */
export function runDto(view: RunView, lookups: RunLookups): AgentRunDto {
  const { run } = view
  return {
    id: run.id,
    agent: { id: run.agentId, name: view.agentName },
    isAgentDeleted: view.agentDeleted,
    agentVersion: view.agentVersion,
    trigger: run.trigger,
    isTest: run.isTest,
    status: run.status,
    startedBy:
      run.startedByUserId === null ? null : (lookups.users.get(run.startedByUserId) ?? null),
    channel:
      run.channelId === null || view.channelType === null
        ? null
        : { id: run.channelId, type: view.channelType },
    model: run.modelKey === null ? null : (lookups.models.get(run.modelKey) ?? null),
    inputTokens: run.inputTokens,
    outputTokens: run.outputTokens,
    costMicros: run.costMicros,
    currency: run.currency,
    minConfidence: run.minConfidence,
    neededHuman: run.neededHuman,
    humanCorrected: run.humanCorrected,
    stepCount: run.stepCount,
    errorCode: run.errorCode,
    startedAt: iso(run.startedAt),
    finishedAt: iso(run.finishedAt),
    durationMs: run.durationMs,
    createdAt: run.createdAt.toISOString(),
  }
}

/** What the steps still hold about a run: the input step says which run it retries. */
export interface RunFacts {
  retryOf: AgentRunDetailDto['retryOf']
  dataLocations: DataLocation[]
}

export function factsOf(steps: readonly StepRow[], run: RunRow): RunFacts {
  const input = inputOf(steps)
  const locations = new Set<DataLocation>(run.summary?.dataLocations ?? [])
  for (const step of steps) if (step.dataLocation !== null) locations.add(step.dataLocation)
  return { retryOf: input?.retryOf ?? null, dataLocations: [...locations] }
}

/** The header, facts and side panel of run detail. */
export function runDetailDto(
  view: RunView,
  lookups: RunLookups,
  facts: RunFacts,
  pendingApprovalIds: readonly string[],
  allowed: { cancel: boolean; retry: boolean },
): AgentRunDetailDto {
  const { run } = view
  const open = isActiveStatus(run.status)
  return {
    ...runDto(view, lookups),
    summary: run.summary,
    retryOf: facts.retryOf,
    dataLocations: facts.dataLocations,
    pendingApprovalIds: [...pendingApprovalIds],
    canCancel: open && view.canEdit && allowed.cancel,
    canRetry: !open && view.canEdit && allowed.retry,
  }
}

/** One step with its data. */
export function stepDetailDto(step: StepRow): AgentRunStepDetailDto {
  return { ...stepEvent(step), input: step.input, output: step.output }
}

/** The final text of a run: the last model call that answered without asking for tools. */
export function answerOf(steps: readonly StepRow[]): string | null {
  for (let index = steps.length - 1; index >= 0; index -= 1) {
    const step = steps[index]
    if (step?.type !== 'model' || step.status !== 'succeeded') continue
    const output = step.output
    if (output?.kind !== 'model') continue
    if ((output.toolCalls?.length ?? 0) > 0) return null
    return output.text ?? ''
  }
  return null
}

/** What the answer cited: the passages the run retrieved, once per document and page. */
export function sourcesOf(steps: readonly StepRow[]): PublicRunOutput['sources'] {
  const seen = new Set<string>()
  const sources: PublicRunOutput['sources'] = []
  for (const step of steps) {
    if (step.type !== 'retrieval' || step.status === 'skipped') continue
    if (step.output?.kind !== 'retrieval') continue
    for (const passage of step.output.passages ?? []) {
      const key = `${passage.documentId}:${String(passage.page)}`
      if (seen.has(key)) continue
      seen.add(key)
      sources.push({ title: passage.title, documentId: passage.documentId, page: passage.page })
    }
  }
  return sources.slice(0, 50)
}

/** A run as an API caller sees it: no steps, no internals. */
export function publicRunDto(run: RunRow, steps: readonly StepRow[] | null): PublicRunDto {
  const answer = run.status === 'succeeded' && steps !== null ? answerOf(steps) : null
  return {
    id: run.id,
    agentId: run.agentId,
    status: run.status,
    output: answer === null || steps === null ? null : { text: answer, sources: sourcesOf(steps) },
    errorCode: run.errorCode,
    waitingForApproval: run.status === 'waiting_approval',
    metadata: { ...(steps === null ? undefined : inputOf(steps)?.metadata) },
    inputTokens: run.inputTokens,
    outputTokens: run.outputTokens,
    createdAt: run.createdAt.toISOString(),
    finishedAt: iso(run.finishedAt),
  }
}
