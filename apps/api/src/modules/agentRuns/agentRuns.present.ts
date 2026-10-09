// SPDX-License-Identifier: AGPL-3.0-only
import type { AgentRunStepDto } from '@surefy/contracts'

import type { StepRow } from './agentRuns.types.js'

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
