// SPDX-License-Identifier: AGPL-3.0-only
import { ERROR_CODES } from '@surefy/contracts'
import type { ChatMessagePart, SourcePart } from '@surefy/contracts'

import { contentTextOf, emptyParts, fitParts } from './chats.utils.js'

import type { ChatMessagesRepository } from './chatMessages.repository.js'
import type { ChatMessageRow } from './chats.mapper.js'
import type { ChatModels } from './chats.types.js'
import type { DbExecutor } from '@/core/database/index.js'
import type { AgentRunsChatAnswers, RunRow, StepRow } from '@/modules/agentRuns/index.js'

const SNIPPET_CHARS = 400
const SOURCES_MAX = 50

export interface ChatAgentAnswersDeps {
  messages: ChatMessagesRepository
  models: ChatModels
}

/** The final answer: the last successful model step that called no tool. */
function answerOf(steps: readonly StepRow[]): string | null {
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

/** The passages the run retrieved, once per document and page, as numbered sources. */
function sourcesOf(steps: readonly StepRow[]): SourcePart[] {
  const seen = new Set<string>()
  const sources: SourcePart[] = []
  for (const step of steps) {
    if (step.type !== 'retrieval' || step.status === 'skipped') continue
    if (step.output?.kind !== 'retrieval') continue
    for (const passage of step.output.passages ?? []) {
      const key = `${passage.documentId}:${String(passage.page)}`
      if (seen.has(key) || sources.length >= SOURCES_MAX) continue
      seen.add(key)
      sources.push({
        type: 'source',
        index: sources.length + 1,
        kind: 'knowledge',
        documentId: passage.documentId,
        ...(passage.page === null ? {} : { page: passage.page }),
        title: passage.title,
        snippet: passage.text.slice(0, SNIPPET_CHARS),
      })
    }
  }
  return sources
}

const approvalPart = (approvalId: string): ChatMessagePart => ({
  type: 'data',
  name: 'approval',
  data: { approvalId },
})

/** The approvals a run asked for, in order, once each. */
const approvalsOf = (steps: readonly StepRow[]): string[] => [
  ...new Set(
    steps.flatMap((step) =>
      step.type === 'approval' && step.approvalId !== null ? [step.approvalId] : [],
    ),
  ),
]

type AnswerStatus = 'complete' | 'stopped' | 'failed'

/** How the answer of an ended run reads in the thread: its approvals, then the text and sources. */
function answerOfRun(
  run: RunRow,
  steps: readonly StepRow[],
): { status: AnswerStatus; parts: ChatMessagePart[] } {
  const approvals = approvalsOf(steps).map(approvalPart)
  if (run.status === 'canceled') {
    return { status: 'stopped', parts: [...approvals, { type: 'data', name: 'stopped', data: {} }] }
  }
  const text = run.status === 'succeeded' ? answerOf(steps) : null
  if (text === null) return { status: 'failed', parts: approvals }
  return {
    status: 'complete',
    parts: [...approvals, { type: 'text', text }, ...sourcesOf(steps)],
  }
}

/**
 * Agent answers in Chat (backend/agent-runs.md, §8): the assistant message streams while its
 * `chat` run works and is written by the run's own transactions, so it exists even when nobody
 * is connected. While the run waits, the message shows the approval cards; when it ends, the
 * answer, its sources and a display copy of the cost. The run keeps the steps.
 */
export class ChatAgentAnswers implements AgentRunsChatAnswers {
  constructor(private readonly deps: ChatAgentAnswersDeps) {}

  async waiting(
    tx: DbExecutor,
    orgId: string,
    runId: string,
    approvalIds: readonly string[],
  ): Promise<void> {
    const message = await this.deps.messages.lockByRun(tx, orgId, runId)
    if (message?.status !== 'streaming') return
    const shown = new Set(
      message.parts.parts.flatMap((part) =>
        part.type === 'data' && part.name === 'approval' ? [part.data.approvalId] : [],
      ),
    )
    const added = approvalIds.filter((id) => !shown.has(id)).map(approvalPart)
    if (added.length === 0) return
    await this.deps.messages.update(tx, orgId, message.id, {
      parts: fitParts(emptyParts([...message.parts.parts, ...added])),
    })
  }

  async finished(tx: DbExecutor, run: RunRow, steps: readonly StepRow[]): Promise<void> {
    if (run.chatId === null) return // the chat was purged
    const orgId = run.organizationId
    const message = await this.answerFor(tx, orgId, run.chatId, run.id)
    if (message?.status !== 'streaming') return
    const { status, parts: answer } = answerOfRun(run, steps)
    const parts = fitParts(emptyParts(answer))
    const modelKey = run.modelKey ?? message.modelKey
    const model = modelKey === null ? undefined : await this.deps.models.find(tx, orgId, modelKey)
    const location = steps.findLast((step) => step.type === 'model' && step.dataLocation !== null)
    await this.deps.messages.update(tx, orgId, message.id, {
      status,
      parts,
      contentText: contentTextOf(parts.parts),
      agentRunId: run.id,
      modelKey,
      vaultModelId: model?.id ?? null,
      inputTokens: run.inputTokens,
      outputTokens: run.outputTokens,
      cachedInputTokens: 0,
      reasoningTokens: 0,
      costMicros: run.costMicros,
      currency: run.currency,
      latencyMs: run.durationMs,
      dataLocation: location?.dataLocation ?? message.dataLocation,
      errorCode: status === 'failed' ? (run.errorCode ?? ERROR_CODES.INTERNAL_ERROR) : null,
    })
    if (status === 'complete') {
      await this.deps.messages.insertCitations(
        tx,
        orgId,
        message.id,
        parts.parts.filter((part): part is SourcePart => part.type === 'source'),
      )
    }
  }

  /**
   * The answer linked to the run; a run that ends before the chat route linked it finds the
   * chat's streaming answer that has no run yet (a chat streams one answer at a time).
   */
  private async answerFor(
    tx: DbExecutor,
    orgId: string,
    chatId: string,
    runId: string,
  ): Promise<ChatMessageRow | undefined> {
    return (
      (await this.deps.messages.lockByRun(tx, orgId, runId)) ??
      (await this.deps.messages.lockUnlinkedAnswer(tx, orgId, chatId))
    )
  }
}
