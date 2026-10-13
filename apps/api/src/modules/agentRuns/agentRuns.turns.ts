// SPDX-License-Identifier: AGPL-3.0-only
import { parseModelKey } from '@surefy/contracts'
import type { AgentRunMessage } from '@surefy/contracts'

import { PASSAGE_PROMPT_CHARS, RETRIEVAL_PASSAGES, TEXT_FLUSH_MS } from './agentRuns.constants.js'
import { RunFailure } from './agentRuns.errors.js'
import { failureCodeOf } from './agentRuns.failure.js'
import { dataLocationOf, piiScopeOf } from './agentRuns.pii.js'
import { buildMessages, systemPrompt, toolSet } from './agentRuns.prompt.js'

import type { StepRecorder } from './agentRuns.recorder.js'
import type { RunSession } from './agentRuns.session.js'
import type { RunState } from './agentRuns.state.js'
import type {
  AgentRunsEvents,
  AgentRunsGateway,
  AgentRunsKnowledge,
  AgentRunsPii,
  AgentRunsTools,
} from './agentRuns.types.js'
import type { Logger } from '@/core/logger/index.js'
import type { ResolvedTool } from '@/modules/agentTools/index.js'

export interface TurnsDeps {
  recorder: StepRecorder
  events: AgentRunsEvents
  gateway: AgentRunsGateway
  pii: AgentRunsPii
  knowledge: AgentRunsKnowledge
  tools: AgentRunsTools
  logger: Logger
  now?: () => Date
}

const lastUserText = (messages: readonly AgentRunMessage[]): string =>
  [...messages].reverse().find((message) => message.role === 'user')?.text ?? ''

/** Batches text deltas into at most one event per flush interval (20 a second). */
class TextBatcher {
  private buffer = ''
  private lastFlush = 0

  constructor(
    private readonly send: (id: string, delta: string) => Promise<void>,
    private readonly now: () => number,
  ) {}

  async add(id: string, delta: string): Promise<void> {
    this.buffer += delta
    if (this.now() - this.lastFlush >= TEXT_FLUSH_MS) await this.flush(id)
  }

  async flush(id: string): Promise<void> {
    if (this.buffer === '') return
    const delta = this.buffer
    this.buffer = ''
    this.lastFlush = this.now()
    await this.send(id, delta)
  }
}

/** The two moves that talk to the knowledge bases and the model: the search, and a model turn. */
export class ModelTurns {
  private readonly now: () => Date

  constructor(private readonly deps: TurnsDeps) {
    this.now = deps.now ?? (() => new Date())
  }

  /** The functions the model may call, resolved once per executor. */
  async toolsOf(session: RunSession): Promise<ResolvedTool[]> {
    session.resolved ??= await this.deps.tools.resolve(session.tools, session.definition.tools)
    return session.resolved
  }

  // ---- Retrieval ----------------------------------------------------------------------------

  /**
   * Searches the agent's knowledge bases for the question, as the person who started the run (so
   * the agent only cites what that person may read) or, without one, within the agent's own bases.
   * A failed search is recorded and the run answers without sources.
   */
  async retrieve(session: RunSession, state: RunState): Promise<void> {
    const seq = state.nextSeq
    const startedAt = this.now()
    const query = lastUserText(session.input.messages)
    const run = { orgId: session.orgId, runId: session.runId }
    let errorCode: string | null = null
    let passages: {
      documentId: string
      title: string
      page: number | null
      score: number
      text: string
    }[] = []
    try {
      const result = await this.deps.knowledge.retrieve({
        orgId: session.orgId,
        who:
          session.starter === null
            ? { userId: null, role: 'admin', teamIds: [] }
            : {
                userId: session.starterId,
                role: session.starter.role,
                teamIds: session.starter.teamIds,
              },
        question: query,
        baseIds: session.definition.knowledge.knowledgeBaseIds,
        answeringModelIsLocal: parseModelKey(session.definition.model.modelKey)?.source === 'local',
        passages: RETRIEVAL_PASSAGES,
        call: session.modelContext(seq),
        signal: session.signal,
      })
      passages = result.passages
        .filter((passage) => passage.isUsed)
        .slice(0, RETRIEVAL_PASSAGES)
        .map((passage) => ({
          documentId: passage.documentId,
          title: passage.documentTitle,
          page: passage.pageFrom,
          score: Math.min(1, Math.max(0, passage.relevance)),
          text: passage.content.slice(0, PASSAGE_PROMPT_CHARS),
        }))
    } catch (error) {
      if (session.signal.aborted) throw error
      errorCode = failureCodeOf(error) ?? 'INTERNAL_ERROR'
      this.deps.logger.warn(
        { orgId: session.orgId, runId: session.runId, seq, errorCode },
        'agent run retrieval failed; answering without sources',
      )
    }
    await this.deps.recorder.record(run, seq, {
      type: 'retrieval',
      name: 'Search knowledge',
      status: errorCode === null ? 'succeeded' : 'failed',
      input: { version: 1, truncated: false, kind: 'retrieval', query },
      output: { version: 1, truncated: false, kind: 'retrieval', passages },
      errorCode,
      startedAt,
      finishedAt: this.now(),
    })
    for (const passage of passages) {
      await this.deps.events.publish(session.orgId, session.runId, {
        type: 'source-url',
        sourceId: passage.documentId,
        url: `/knowledge/documents/${passage.documentId}`,
        title: passage.title,
      })
    }
  }

  // ---- A model turn -------------------------------------------------------------------------

  /**
   * One model call through the gateway with the conversation rebuilt from the steps. The text and
   * reasoning stream to the event stream as they arrive; the `model` step holds the final text
   * and the tool calls the model asked for. A model that cannot answer ends the run with the
   * gateway's code. Before a cloud model reads the instructions, the sources and the conversation,
   * the personal-data filter masks them or, for a blocked type, ends the run with
   * `GUARD_PII_BLOCKED`; the step keeps where the data went, never a copy of the masked text.
   */
  async modelTurn(session: RunSession, state: RunState): Promise<void> {
    const seq = state.nextSeq
    const startedAt = this.now()
    const run = { orgId: session.orgId, runId: session.runId }
    const tools = await this.toolsOf(session)
    const passages = state.retrieval?.passages ?? []
    const messages = buildMessages(state)
    const summary = `${messages.length} messages, ${tools.length} tools, ${passages.length} sources`
    const events = this.deps.events
    const publish = (chunk: { type: string; [key: string]: unknown }) =>
      events.publish(session.orgId, session.runId, chunk)

    let text = ''
    const toolCalls: { id: string; name: string; arguments: Record<string, unknown> }[] = []
    let finishReason: string | undefined
    let model: Awaited<ReturnType<AgentRunsGateway['streamText']>> | undefined
    try {
      const filtered = await this.deps.pii.applyToRequest({
        ...piiScopeOf(session),
        system: systemPrompt(session.definition, passages),
        messages,
      })
      model = await this.deps.gateway.streamText(session.modelContext(seq, filtered.masked), {
        modelKey: session.definition.model.modelKey,
        instructions: filtered.system ?? '',
        messages: filtered.messages,
        tools: toolSet(tools),
        temperature: session.definition.model.creativity,
        signal: session.signal,
      })
      const batcher = new TextBatcher(
        (id, delta) => publish({ type: 'text-delta', id, delta }),
        () => Date.now(),
      )
      for await (const part of model.result.stream) {
        switch (part.type) {
          case 'text-start':
            await publish({ type: 'text-start', id: part.id })
            break
          case 'text-delta':
            text += part.text
            await batcher.add(part.id, part.text)
            break
          case 'text-end':
            await batcher.flush(part.id)
            await publish({ type: 'text-end', id: part.id })
            break
          case 'reasoning-start':
            await publish({ type: 'reasoning-start', id: part.id })
            break
          case 'reasoning-delta':
            await publish({ type: 'reasoning-delta', id: part.id, delta: part.text })
            break
          case 'reasoning-end':
            await publish({ type: 'reasoning-end', id: part.id })
            break
          case 'tool-call': {
            const input = isRecord(part.input) ? part.input : {}
            toolCalls.push({ id: part.toolCallId, name: part.toolName, arguments: input })
            await publish({
              type: 'tool-input-available',
              toolCallId: part.toolCallId,
              toolName: part.toolName,
              input,
            })
            break
          }
          case 'finish':
            finishReason = part.finishReason
            break
          case 'error':
            throw part.error
          default:
            break
        }
      }
    } catch (error) {
      if (session.signal.aborted) throw error
      const code = failureCodeOf(error)
      if (code === null) throw error
      await this.recordFailedTurn(session, seq, startedAt, summary, code)
      throw new RunFailure(code, { cause: error })
    }

    const call = await model.call
    await this.deps.recorder.record(run, seq, {
      type: 'model',
      name: call.model.displayName,
      status: 'succeeded',
      input: { version: 1, truncated: false, kind: 'model', messagesSummary: summary },
      output: {
        version: 1,
        truncated: false,
        kind: 'model',
        text,
        toolCalls,
        ...(finishReason === undefined ? {} : { finishReason }),
      },
      modelKey: call.model.modelKey,
      inputTokens: call.usage.inputTokens,
      outputTokens: call.usage.outputTokens,
      costMicros: call.usage.costMicros,
      currency: call.usage.currency,
      dataLocation: dataLocationOf(call.model.source),
      startedAt,
      finishedAt: this.now(),
    })
    await publish({ type: 'data-usage', data: { seq, ...call.usage, reasoningTokens: 0 } })
  }

  private async recordFailedTurn(
    session: RunSession,
    seq: number,
    startedAt: Date,
    summary: string,
    code: string,
  ): Promise<void> {
    try {
      await this.deps.recorder.record({ orgId: session.orgId, runId: session.runId }, seq, {
        type: 'model',
        name: session.definition.model.modelKey,
        status: 'failed',
        input: { version: 1, truncated: false, kind: 'model', messagesSummary: summary },
        errorCode: code,
        startedAt,
        finishedAt: this.now(),
      })
    } catch (error) {
      // the run still ends with the model's code: a failed trace row is not worth losing it
      this.deps.logger.warn(
        { err: error, runId: session.runId, seq },
        'failed model step not recorded',
      )
    }
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
