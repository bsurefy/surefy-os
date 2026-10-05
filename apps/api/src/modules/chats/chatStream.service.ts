// SPDX-License-Identifier: AGPL-3.0-only
import { toUIMessageStream } from 'ai'

import { AppError } from '@/core/errors/index.js'
import { providerErrorFrom } from '@/integrations/ai/index.js'
import { ModelNotAllowedError } from '@/modules/modelGateway/index.js'
import { ERROR_CODES } from '@surefy/contracts'
import type {
  ChatMessageIdsData,
  ChatMessagePart,
  ChatModelData,
  ChatUsage,
  DataLocation,
  ModelCallResultDto,
  SendChatMessageInput,
  SourcePart,
} from '@surefy/contracts'

import { modelCallContext, requireUser } from './chatContext.js'
import { PartsBuilder } from './chatParts.js'
import { buildModelMessages } from './chatPrompt.js'
import {
  INTERRUPTED_ERROR_CODE,
  SOURCES_PROMPT,
  STREAM_CHECKPOINT_MS,
  STREAM_STALE_MS,
  SYSTEM_PROMPT,
  TITLE_PROMPT,
} from './chats.constants.js'
import {
  ChatAttachmentNotFoundError,
  ChatAttachmentNotReadyError,
  ChatMessageNotFoundError,
  ChatMessageStateInvalidError,
  ChatModelNoVisionError,
  ChatNotFoundError,
  ChatStreamInProgressError,
} from './chats.errors.js'
import {
  cleanTitle,
  contentTextOf,
  emptyParts,
  fallbackTitle,
  fitParts,
  sourcesBlock,
} from './chats.utils.js'
import { assertModelUsable, resolveSettings, type ChatSettingsDeps } from './chatSettings.js'

import type { ChatAttachmentsRepository } from './chatAttachments.repository.js'
import type { ChatMessagesRepository } from './chatMessages.repository.js'
import type { ChatAttachmentRow, ChatMessageRow, ChatRow } from './chats.mapper.js'
import type { ChatsRepository } from './chats.repository.js'
import type {
  ChatGateway,
  ChatModelInfo,
  ChatModels,
  ChatRetrieval,
  RetrievedPassage,
} from './chats.types.js'
import type { Database, DbExecutor } from '@/core/database/index.js'
import type { Logger } from '@/core/logger/index.js'
import type { StorageProvider } from '@/integrations/storage/index.js'
import type { GatewayStream } from '@/modules/modelGateway/index.js'
import type { TenantContext } from '@/types/context.js'
import type { UIMessageChunk } from 'ai'

export interface ChatStreamServiceDeps {
  db: Database
  chats: ChatsRepository
  messages: ChatMessagesRepository
  attachments: ChatAttachmentsRepository
  models: ChatModels
  gateway: ChatGateway
  retrieval: ChatRetrieval
  storage: StorageProvider
  logger: Logger
  now?: () => number
}

/** Everything the transaction that opens an answer decided, for the model call and the stream. */
interface Prepared {
  chat: ChatRow
  model: ChatModelInfo
  history: ChatMessageRow[]
  attachments: ChatAttachmentRow[]
  userMessageId: string | null
  assistantMessageId: string
  /** The text of the question: retrieval and the title read it. */
  question: string
  continuing: boolean
  /** The first answer of the chat, which names it. */
  needsTitle: boolean
  initialParts: ChatMessagePart[]
}

/** What a send does to the thread (see `plan`). */
interface Plan {
  history: ChatMessageRow[]
  superseded: string[]
  /** The new user message; null for regenerate and continue. */
  text: string | null
  attachmentIds: readonly string[]
  requestedModelKey?: string
  continuing: boolean
}

const withModel = (
  plan: Omit<Plan, 'continuing' | 'requestedModelKey'> & { continuing?: boolean },
  modelKey: string | undefined,
): Plan => ({
  ...plan,
  continuing: plan.continuing ?? false,
  ...(modelKey === undefined ? {} : { requestedModelKey: modelKey }),
})

const TITLE_TIMEOUT_MS = 8_000
const SNIPPET_CHARS = 400
const RETRIEVAL_FAILED = 'chat retrieval failed; answering without sources'

const dataLocationOf = (source: ChatModelInfo['source'] | 'platform'): DataLocation => {
  if (source === 'local' || source === 'platform') return source
  return 'provider'
}

/** The API error code a failure becomes: in the stream's `error` chunk and on the message. */
export function errorCodeOf(error: unknown): string {
  if (error instanceof AppError) return error.code
  return providerErrorFrom(error) === null
    ? ERROR_CODES.INTERNAL_ERROR
    : ERROR_CODES.MODEL_PROVIDER_UNAVAILABLE
}

/**
 * The streaming endpoint (backend/api.md §8): opens the answer in one transaction (the messages,
 * the chat's count and the attachments they carry), calls the model through the gateway, streams
 * the AI SDK UI message stream, and writes the finished answer once. The write happens even when
 * the client has gone, so a stopped answer keeps its partial text.
 */
export class ChatStreamService {
  private readonly inflight = new Set<Promise<void>>()

  constructor(private readonly deps: ChatStreamServiceDeps) {}

  private now(): number {
    return (this.deps.now ?? Date.now)()
  }

  private get settingsDeps(): ChatSettingsDeps {
    return { repository: this.deps.chats, models: this.deps.models }
  }

  /** Waits for answers still being written (graceful shutdown, tests). */
  async drain(): Promise<void> {
    await Promise.allSettled([...this.inflight])
  }

  /**
   * Errors thrown here are errors before the first byte, answered as the normal error envelope.
   * `signal` aborts the model call when the client goes away.
   */
  async send(
    ctx: TenantContext,
    chatId: string,
    input: SendChatMessageInput,
    signal: AbortSignal,
  ): Promise<ReadableStream<UIMessageChunk>> {
    const userId = requireUser(ctx)
    const prepared = await this.prepare(ctx, userId, chatId, input)
    const retrieval = await this.retrieve(ctx, prepared, signal)
    const builder = new PartsBuilder([...prepared.initialParts, ...retrieval.parts], this.deps.now)
    let stream: GatewayStream
    try {
      stream = await this.deps.gateway.streamText(
        modelCallContext(ctx, {
          isPrivateChat: prepared.chat.isPrivate,
          meter: {
            key: `chat:${prepared.assistantMessageId}`,
            sourceRefId: prepared.assistantMessageId,
          },
        }),
        {
          modelKey: prepared.model.modelKey,
          system: retrieval.system,
          messages: await this.modelMessages(ctx.orgId, prepared),
          signal,
        },
      )
    } catch (error) {
      await this.settleBeforeStream(ctx.orgId, prepared, error, signal, builder)
      throw error
    }
    return this.open(ctx, userId, prepared, stream, builder, retrieval.notes, signal)
  }

  // ── Opening the answer ──────────────────────────────────────────────────────────────────────

  private prepare(
    ctx: TenantContext,
    userId: string,
    chatId: string,
    input: SendChatMessageInput,
  ): Promise<Prepared> {
    return this.deps.db.tenant(ctx.orgId, async (tx) => {
      const chat = await this.openChat(tx, ctx, userId, chatId, input)
      await this.assertIdle(tx, ctx.orgId, chatId)
      const thread = await this.deps.messages.thread(tx, ctx.orgId, chatId)
      const plan = await this.plan(tx, ctx.orgId, chatId, thread, input)
      const model = await this.pickModel(tx, ctx, chat, plan.requestedModelKey)
      const carried = await this.carriedAttachments(
        tx,
        ctx.orgId,
        chatId,
        plan.attachmentIds,
        model,
      )
      return this.write(tx, { ctx, userId, chat, model, plan, carried })
    })
  }

  /** The chat row, locked; created with its first message; or given its settings if an attachment made it. */
  private async openChat(
    tx: DbExecutor,
    ctx: TenantContext,
    userId: string,
    chatId: string,
    input: SendChatMessageInput,
  ): Promise<ChatRow> {
    const { chats } = this.deps
    const existing = await chats.lockOwned(tx, ctx.orgId, userId, chatId)
    if (existing === undefined && input.trigger !== 'submit') throw new ChatNotFoundError()
    const starting = existing === undefined || existing.messageCount === 0
    if (input.trigger !== 'submit' || !starting) {
      if (existing === undefined) throw new ChatNotFoundError()
      return existing
    }
    const settings = await resolveSettings(
      this.settingsDeps,
      tx,
      ctx,
      userId,
      input.newChat ?? {},
      existing ?? null,
    )
    const chat =
      existing === undefined
        ? await chats.insert(tx, {
            id: chatId,
            organizationId: ctx.orgId,
            ownerUserId: userId,
            ...settings.patch,
          })
        : await chats.update(tx, ctx.orgId, chatId, settings.patch)
    if (chat === undefined) throw new ChatNotFoundError() // the id belongs to someone else
    if (settings.knowledgeBaseIds !== undefined) {
      await chats.replaceKnowledgeBases(tx, ctx.orgId, chatId, settings.knowledgeBaseIds)
    }
    return chat
  }

  /** One answer at a time per chat; a stale `streaming` row is settled first. */
  private async assertIdle(tx: DbExecutor, orgId: string, chatId: string): Promise<void> {
    const { messages } = this.deps
    await messages.interruptStale(
      tx,
      new Date(this.now() - STREAM_STALE_MS),
      INTERRUPTED_ERROR_CODE,
      { orgId, chatId },
    )
    if (await messages.hasStreaming(tx, orgId, chatId)) throw new ChatStreamInProgressError()
  }

  /** What the trigger does to the thread: which messages stay, which are replaced, what is new. */
  private async plan(
    tx: DbExecutor,
    orgId: string,
    chatId: string,
    thread: ChatMessageRow[],
    input: SendChatMessageInput,
  ): Promise<Plan> {
    if (input.trigger === 'submit') {
      return withModel(
        { history: thread, superseded: [], text: input.text, attachmentIds: input.attachmentIds },
        input.modelKey,
      )
    }
    const target = thread.find((message) => message.id === input.messageId)
    if (target === undefined) throw new ChatMessageNotFoundError()
    const isLast = thread.at(-1)?.id === target.id
    if (input.trigger === 'regenerate') {
      if (target.role !== 'assistant' || !isLast) {
        throw new ChatMessageStateInvalidError('Only the latest answer can be regenerated')
      }
      return withModel(
        { history: thread.slice(0, -1), superseded: [target.id], text: null, attachmentIds: [] },
        input.modelKey,
      )
    }
    if (input.trigger === 'edit') {
      if (target.role !== 'user') {
        throw new ChatMessageStateInvalidError('Only your own message can be edited')
      }
      const replaced = new Set(
        (await this.deps.messages.fromMessage(tx, orgId, chatId, target)).map((m) => m.id),
      )
      return withModel(
        {
          history: thread.filter((message) => !replaced.has(message.id)),
          superseded: [...replaced],
          text: input.text,
          attachmentIds: input.attachmentIds,
        },
        input.modelKey,
      )
    }
    if (target.role !== 'assistant' || target.status !== 'stopped' || !isLast) {
      throw new ChatMessageStateInvalidError('Only a stopped answer can be continued')
    }
    return withModel(
      { history: thread, superseded: [], text: null, attachmentIds: [], continuing: true },
      target.modelKey ?? undefined,
    )
  }

  /** The model asked for, else the chat's current one, else the first the person may use. */
  private async pickModel(
    tx: DbExecutor,
    ctx: TenantContext,
    chat: ChatRow,
    requested: string | undefined,
  ): Promise<ChatModelInfo> {
    let modelKey = requested ?? chat.currentModelKey ?? undefined
    modelKey ??= (
      await this.deps.models.firstUsable(tx, ctx.orgId, ctx.access.allowedModelIds, {
        localOnly: chat.isPrivate,
      })
    )?.modelKey
    if (modelKey === undefined) throw new ModelNotAllowedError()
    return assertModelUsable(this.settingsDeps, tx, ctx, modelKey, { isPrivate: chat.isPrivate })
  }

  /** This chat's attachments, ready and not sent before; images need a model that reads them. */
  private async carriedAttachments(
    tx: DbExecutor,
    orgId: string,
    chatId: string,
    ids: readonly string[],
    model: ChatModelInfo,
  ): Promise<ChatAttachmentRow[]> {
    const carried = await this.deps.attachments.findMany(tx, orgId, chatId, ids)
    if (carried.length !== new Set(ids).size || carried.some((a) => a.messageId !== null)) {
      throw new ChatAttachmentNotFoundError()
    }
    if (carried.some((attachment) => attachment.status !== 'ready')) {
      throw new ChatAttachmentNotReadyError()
    }
    if (!model.supportsVision && carried.some((attachment) => attachment.kind === 'image')) {
      throw new ChatModelNoVisionError()
    }
    return carried
  }

  /** The writes of one send: supersede, the new messages, the chat's count, the attachment links. */
  private async write(
    tx: DbExecutor,
    open: {
      ctx: TenantContext
      userId: string
      chat: ChatRow
      model: ChatModelInfo
      plan: Plan
      carried: ChatAttachmentRow[]
    },
  ): Promise<Prepared> {
    const { ctx, userId, chat, model, plan, carried } = open
    const { messages, attachments, chats } = this.deps
    const lastModel = await messages.lastAnswerModel(tx, ctx.orgId, chat.id)
    const supersededCount = await messages.supersede(tx, ctx.orgId, plan.superseded)
    let userMessage: ChatMessageRow | null = null
    if (plan.text !== null) {
      userMessage = await messages.insert(tx, {
        organizationId: ctx.orgId,
        chatId: chat.id,
        role: 'user',
        status: 'complete',
        contentText: plan.text,
        parts: emptyParts([
          { type: 'text', text: plan.text },
          ...carried.map((attachment): ChatMessagePart => ({
            type: 'file',
            attachmentId: attachment.id,
            mediaType: attachment.contentType,
            name: attachment.fileName,
          })),
        ]),
        authorUserId: userId,
      })
      await attachments.link(
        tx,
        ctx.orgId,
        carried.map((attachment) => attachment.id),
        userMessage.id,
      )
    }
    const initialParts: ChatMessagePart[] =
      lastModel !== null && lastModel !== model.modelKey
        ? [{ type: 'model-switch', fromModelKey: lastModel, toModelKey: model.modelKey }]
        : []
    const assistant = await messages.insert(tx, {
      organizationId: ctx.orgId,
      chatId: chat.id,
      role: 'assistant',
      status: 'streaming',
      parts: emptyParts(initialParts),
      modelKey: model.modelKey,
      dataLocation: dataLocationOf(model.source),
    })
    await chats.bumpMessages(tx, ctx.orgId, chat.id, {
      delta: (userMessage === null ? 0 : 1) + 1 - supersededCount,
      lastMessageAt: new Date(this.now()),
      currentModelKey: model.modelKey,
    })
    const history = userMessage === null ? plan.history : [...plan.history, userMessage]
    const lastQuestion = [...history].reverse().find((message) => message.role === 'user')
    return {
      chat,
      model,
      history,
      attachments: await attachments.ofMessages(
        tx,
        ctx.orgId,
        history.map((message) => message.id),
      ),
      userMessageId: userMessage?.id ?? null,
      assistantMessageId: assistant.id,
      question: plan.text ?? lastQuestion?.contentText ?? '',
      continuing: plan.continuing,
      needsTitle: chat.title === '' && !chat.titleGenerated && plan.text !== null,
      initialParts,
    }
  }

  /** Knowledge in scope: the passages become numbered sources and part of the system prompt. */
  private async retrieve(
    ctx: TenantContext,
    prepared: Prepared,
    signal: AbortSignal,
  ): Promise<{ system: string; parts: ChatMessagePart[]; notes: ChatMessagePart[] }> {
    const none = { system: SYSTEM_PROMPT, parts: [], notes: [] }
    if (
      prepared.chat.knowledgeScope === 'none' ||
      prepared.continuing ||
      prepared.question === ''
    ) {
      return none
    }
    try {
      const selected =
        prepared.chat.knowledgeScope === 'selected'
          ? ((
              await this.deps.db.tenant(ctx.orgId, (tx) =>
                this.deps.chats.knowledgeBaseIds(tx, ctx.orgId, [prepared.chat.id]),
              )
            ).get(prepared.chat.id) ?? [])
          : []
      const result = await this.deps.retrieval.retrieve({
        ctx,
        query: prepared.question,
        scope: prepared.chat.knowledgeScope,
        knowledgeBaseIds: selected,
        signal,
      })
      const notes: ChatMessagePart[] = []
      if (result.skipped !== null) {
        notes.push({ type: 'data', name: 'knowledge-skipped', data: { reason: result.skipped } })
      }
      if (result.processingCount > 0) {
        notes.push({
          type: 'data',
          name: 'sources-processing',
          data: { count: result.processingCount },
        })
      }
      const parts = result.passages.map((passage, index) => sourcePartOf(passage, index + 1))
      if (parts.length === 0) return { ...none, notes }
      return {
        system: `${SYSTEM_PROMPT}\n\n${SOURCES_PROMPT}\n\n${sourcesBlock(
          result.passages.map((passage, index) => ({
            index: index + 1,
            title: passage.title,
            snippet: passage.text,
          })),
        )}`,
        parts,
        notes,
      }
    } catch (error) {
      if (signal.aborted) throw error
      this.deps.logger.warn({ err: error }, RETRIEVAL_FAILED)
      return none
    }
  }

  private async modelMessages(orgId: string, prepared: Prepared) {
    const byMessage = new Map<string, ChatAttachmentRow[]>()
    for (const attachment of prepared.attachments) {
      if (attachment.messageId === null) continue
      byMessage.set(attachment.messageId, [
        ...(byMessage.get(attachment.messageId) ?? []),
        attachment,
      ])
    }
    return buildModelMessages({
      history: prepared.history,
      attachmentsByMessage: byMessage,
      supportsVision: prepared.model.supportsVision,
      continuing: prepared.continuing,
      readImage: async (attachment) => {
        const chunks: Buffer[] = []
        const body: AsyncIterable<Buffer | string> = await this.deps.storage.get(
          attachment.objectKey,
        )
        for await (const chunk of body) {
          chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk)
        }
        return Buffer.concat(chunks)
      },
    })
  }

  /** The model could not start: the user's message stays, the answer is `failed` (or `stopped`). */
  private async settleBeforeStream(
    orgId: string,
    prepared: Prepared,
    error: unknown,
    signal: AbortSignal,
    builder: PartsBuilder,
  ): Promise<void> {
    const stopped = signal.aborted
    if (stopped) builder.push({ type: 'data', name: 'stopped', data: {} })
    try {
      await this.deps.db.tenant(orgId, (tx) =>
        this.deps.messages.update(tx, orgId, prepared.assistantMessageId, {
          status: stopped ? 'stopped' : 'failed',
          parts: builder.snapshot(),
          errorCode: stopped ? null : errorCodeOf(error),
        }),
      )
    } catch (writeError) {
      this.deps.logger.error({ err: writeError }, 'chat answer not marked failed')
    }
  }

  // ── Streaming ───────────────────────────────────────────────────────────────────────────────

  private open(
    ctx: TenantContext,
    userId: string,
    prepared: Prepared,
    stream: GatewayStream,
    builder: PartsBuilder,
    notes: readonly ChatMessagePart[],
    signal: AbortSignal,
  ): ReadableStream<UIMessageChunk> {
    let controller!: ReadableStreamDefaultController<UIMessageChunk>
    let open = true
    const out = new ReadableStream<UIMessageChunk>({
      start: (c) => {
        controller = c
      },
      cancel: () => {
        open = false // the client went away; the pump keeps going to store the partial answer
      },
    })
    const enqueue = (chunk: UIMessageChunk) => {
      if (!open) return
      try {
        controller.enqueue(chunk)
      } catch {
        open = false
      }
    }
    const done = this.pump(ctx, userId, prepared, stream, builder, notes, signal, enqueue).finally(
      () => {
        if (!open) return
        open = false
        try {
          controller.close()
        } catch {
          // already closed by the consumer
        }
      },
    )
    this.track(done)
    return out
  }

  private async pump(
    ctx: TenantContext,
    _userId: string,
    prepared: Prepared,
    stream: GatewayStream,
    builder: PartsBuilder,
    notes: readonly ChatMessagePart[],
    signal: AbortSignal,
    enqueue: (chunk: UIMessageChunk) => void,
  ): Promise<void> {
    const messageId = prepared.assistantMessageId
    const ids: ChatMessageIdsData = {
      userMessageId: prepared.userMessageId,
      assistantMessageId: messageId,
    }
    const modelData: ChatModelData = {
      model: stream.model,
      dataLocation: dataLocationOf(stream.model.source),
      piiMasked: false,
      routed: false,
      fallback: stream.fallback,
    }
    enqueue({ type: 'start', messageId })
    enqueue({ type: 'data-message', data: ids })
    enqueue({ type: 'data-model', data: modelData })
    for (const note of notes) builder.push(note)

    let failure: string | null = null
    const checkpoint = setInterval(() => {
      this.track(this.checkpoint(ctx.orgId, messageId, builder))
    }, STREAM_CHECKPOINT_MS)
    try {
      for await (const chunk of toUIMessageStream({
        stream: stream.result.stream,
        sendStart: false,
        sendFinish: false,
        sendReasoning: true,
        sendSources: true,
        onError: (error) => {
          failure = errorCodeOf(error)
          if (failure === ERROR_CODES.INTERNAL_ERROR) {
            this.deps.logger.error({ err: error }, 'chat stream failed')
          }
          return failure
        },
      })) {
        builder.apply(chunk)
        enqueue(chunk)
      }
    } catch (error) {
      failure ??= errorCodeOf(error)
      enqueue({ type: 'error', errorText: failure })
    } finally {
      clearInterval(checkpoint)
    }

    const stopped = signal.aborted
    const call = await stream.call
    const reasoningTokens = await stream.result.usage.then(
      (usage) => usage.outputTokenDetails.reasoningTokens ?? 0,
      () => 0,
    )
    if (stopped) builder.push({ type: 'data', name: 'stopped', data: {} })
    const status = finalStatus(stopped, failure, builder.hasText)

    let title: string | null = null
    if (status === 'complete' && prepared.needsTitle) {
      title = await this.titleFor(ctx, prepared, call.model.modelKey, builder)
      if (title !== null) enqueue({ type: 'data-title', data: { title } })
    }
    await this.finish(ctx.orgId, prepared, builder, call, reasoningTokens, status, failure, title)
    enqueue({ type: 'data-usage', data: usageOf(call, reasoningTokens) })
    enqueue({ type: 'finish' })
  }

  /** The finished answer, written once: parts, text, tokens, cost, timing, citations, the title. */
  private async finish(
    orgId: string,
    prepared: Prepared,
    builder: PartsBuilder,
    call: ModelCallResultDto,
    reasoningTokens: number,
    status: 'complete' | 'stopped' | 'interrupted' | 'failed',
    failure: string | null,
    title: string | null,
  ): Promise<void> {
    const parts = fitParts(builder.snapshot())
    try {
      await this.deps.db.tenant(orgId, async (tx) => {
        const model = await this.deps.models.find(tx, orgId, call.model.modelKey)
        await this.deps.messages.update(tx, orgId, prepared.assistantMessageId, {
          status,
          parts,
          contentText: contentTextOf(parts.parts),
          modelKey: call.model.modelKey,
          vaultModelId: model?.id ?? null,
          inputTokens: call.usage.inputTokens,
          outputTokens: call.usage.outputTokens,
          cachedInputTokens: call.usage.cachedInputTokens,
          reasoningTokens,
          costMicros: call.usage.costMicros,
          currency: call.usage.currency,
          latencyMs: call.usage.latencyMs,
          timeToFirstTokenMs: call.usage.firstTokenMs,
          dataLocation: dataLocationOf(
            call.credentialScope === 'local' || call.credentialScope === 'platform'
              ? call.credentialScope
              : 'provider',
          ),
          routed: call.routed,
          errorCode: failure,
        })
        if (status === 'complete') {
          await this.deps.messages.insertCitations(
            tx,
            orgId,
            prepared.assistantMessageId,
            builder.sources,
          )
        }
        if (title !== null) {
          await this.deps.chats.update(tx, orgId, prepared.chat.id, { title, titleGenerated: true })
        }
      })
    } catch (error) {
      // the message stays `streaming`; the next read of the chat settles it as interrupted
      this.deps.logger.error({ err: error }, 'chat answer not stored')
    }
  }

  private async checkpoint(orgId: string, messageId: string, builder: PartsBuilder): Promise<void> {
    try {
      const parts = fitParts(builder.snapshot())
      await this.deps.db.tenant(orgId, (tx) =>
        this.deps.messages.update(tx, orgId, messageId, {
          parts,
          contentText: contentTextOf(parts.parts),
        }),
      )
    } catch (error) {
      this.deps.logger.warn({ err: error }, 'chat checkpoint not written')
    }
  }

  /** The first answer names the chat; when the model cannot, the question's first line does. */
  private async titleFor(
    ctx: TenantContext,
    prepared: Prepared,
    modelKey: string,
    builder: PartsBuilder,
  ): Promise<string | null> {
    const answer = contentTextOf(builder.snapshot().parts)
    const timeout = AbortSignal.timeout(TITLE_TIMEOUT_MS)
    try {
      const { text } = await this.deps.gateway.generateText(
        modelCallContext(ctx, {
          isPrivateChat: prepared.chat.isPrivate,
          meter: {
            key: `chat-title:${prepared.assistantMessageId}`,
            sourceRefId: prepared.assistantMessageId,
          },
        }),
        {
          modelKey,
          system: TITLE_PROMPT,
          prompt: `Question:\n${prepared.question.slice(0, 1000)}\n\nAnswer:\n${answer.slice(0, 1000)}`,
          maxOutputTokens: 40,
          signal: timeout,
        },
      )
      const title = cleanTitle(text)
      return title === '' ? fallbackTitle(prepared.question) : title
    } catch (error) {
      this.deps.logger.warn({ err: error }, 'chat title not generated')
      const title = fallbackTitle(prepared.question)
      return title === '' ? null : title
    }
  }

  private track(promise: Promise<void>): void {
    const tracked = promise.catch((error: unknown) => {
      this.deps.logger.error({ err: error }, 'chat stream task failed')
    })
    this.inflight.add(tracked)
    void tracked.finally(() => this.inflight.delete(tracked))
  }
}

/** How an answer ended: stopped by the client, finished, cut off after some text, or never started. */
function finalStatus(
  stopped: boolean,
  failure: string | null,
  hasText: boolean,
): 'complete' | 'stopped' | 'interrupted' | 'failed' {
  if (stopped) return 'stopped'
  if (failure === null) return 'complete'
  return hasText ? 'interrupted' : 'failed'
}

function sourcePartOf(passage: RetrievedPassage, index: number): SourcePart {
  return {
    type: 'source',
    index,
    kind: 'knowledge',
    knowledgeBaseId: passage.knowledgeBaseId,
    documentId: passage.documentId,
    chunkId: passage.chunkId,
    ...(passage.page === null ? {} : { page: passage.page }),
    title: passage.title,
    snippet: passage.text.slice(0, SNIPPET_CHARS),
  }
}

function usageOf(call: ModelCallResultDto, reasoningTokens: number): ChatUsage {
  return { ...call.usage, reasoningTokens }
}
