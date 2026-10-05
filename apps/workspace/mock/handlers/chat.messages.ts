// SPDX-License-Identifier: AGPL-3.0-only
import { z } from 'zod'

import {
  CHAT_ATTACHMENT_LIMITS,
  CHAT_ATTACHMENT_TYPES,
  CHAT_IMAGE_TYPES,
  chatAttachmentDtoSchema,
  chatAttachmentUploadDtoSchema,
  chatFeedbackDtoSchema,
  chatMessageDtoSchema,
  chatSourcePreviewDtoSchema,
  ERROR_CODES,
  okResponse,
  pageResponse,
  PAGE_SIZE,
  requestChatAttachmentUploadInputSchema,
  sendChatMessageInputSchema,
  setChatFeedbackInputSchema,
} from '@surefy/contracts'
import type {
  ChatAttachmentDto,
  ChatDto,
  ChatMessageDto,
  ChatMessagePart,
  ChatModelData,
  ChatUsage,
  SourcePart,
} from '@surefy/contracts'
import { defineFactory, fixtureUuid } from '@surefy/web-core/testing'
import { defineMockHandler, mockError, mockOk, mockPage } from '@surefy/web-core/testing/mock'

const MESSAGE_KIND = 72
const ATTACHMENT_KIND = 73
const KNOWLEDGE_BASE_KIND = 80
const DOCUMENT_KIND = 82
const HTTP_NOT_FOUND = 404
const HTTP_CONFLICT = 409
const HTTP_UNPROCESSABLE = 422
const HTTP_PAYMENT_REQUIRED = 402
const HTTP_TOO_MANY = 429
const HTTP_BAD_GATEWAY = 502
const HOUR_MS = 3_600_000
const RETRY_AFTER_SECONDS = 5

export const MOCK_MODEL = {
  modelKey: 'openai/gpt-4.1',
  displayName: 'GPT-4.1',
  providerKey: 'openai',
  source: 'provider',
} as const

const OLD_MODEL_KEY = 'anthropic/claude-sonnet-4'

/** Milliseconds between streamed words; tests set it to 0. */
let streamDelayMs = 25
export function setMockStreamDelay(ms: number): void {
  streamDelayMs = ms
}

/** A complete user message of the signed-in person, unless overridden. */
export const chatMessageFactory = defineFactory(
  chatMessageDtoSchema,
  (sequence): ChatMessageDto => ({
    id: fixtureUuid(MESSAGE_KIND, sequence),
    chatId: fixtureUuid(70, 1),
    role: 'user',
    status: 'complete',
    parts: { version: 1, parts: [{ type: 'text', text: `Message ${sequence}` }] },
    authorUserId: null,
    modelKey: null,
    dataLocation: null,
    piiMasked: false,
    routed: false,
    errorCode: null,
    usage: null,
    feedback: null,
    createdAt: '2026-01-02T09:00:00.000Z',
    updatedAt: '2026-01-02T09:00:00.000Z',
  }),
)

export interface ChatStore {
  find: (chatId: string) => { chat: ChatDto; text: string } | undefined
  /** Inserts a chat the first message created. */
  create: (chat: ChatDto) => void
  update: (chat: ChatDto) => void
}

const ago = (ms: number) => new Date(Date.now() - ms).toISOString()

const knowledgeSource = (
  index: number,
  title: string,
  snippet: string,
  page?: number,
): SourcePart => ({
  type: 'source',
  index,
  kind: 'knowledge',
  knowledgeBaseId: fixtureUuid(KNOWLEDGE_BASE_KIND, 1),
  documentId: fixtureUuid(DOCUMENT_KIND, index),
  title,
  snippet,
  ...(page === undefined ? {} : { page }),
})

const usage = (outputTokens: number): ChatUsage => ({
  inputTokens: 240,
  outputTokens,
  cachedInputTokens: 0,
  costMicros: 1800,
  currency: 'USD',
  firstTokenMs: 420,
  latencyMs: 2100,
  reasoningTokens: 0,
})

const assistant = (
  sequence: number,
  chatId: string,
  parts: ChatMessagePart[],
  overrides: Partial<ChatMessageDto> = {},
): ChatMessageDto =>
  chatMessageFactory({
    id: fixtureUuid(MESSAGE_KIND, sequence),
    chatId,
    role: 'assistant',
    parts: { version: 1, parts },
    modelKey: MOCK_MODEL.modelKey,
    dataLocation: 'provider',
    usage: usage(180),
    createdAt: ago(2 * HOUR_MS - sequence * 1000),
    updatedAt: ago(2 * HOUR_MS - sequence * 1000),
    ...overrides,
  })

const userText = (sequence: number, chatId: string, text: string): ChatMessageDto =>
  chatMessageFactory({
    id: fixtureUuid(MESSAGE_KIND, sequence),
    chatId,
    parts: { version: 1, parts: [{ type: 'text', text }] },
    createdAt: ago(2 * HOUR_MS - sequence * 1000),
    updatedAt: ago(2 * HOUR_MS - sequence * 1000),
  })

const CHATS = {
  quarterly: fixtureUuid(70, 1),
  refunds: fixtureUuid(70, 2),
  onboarding: fixtureUuid(70, 3),
  sql: fixtureUuid(70, 5),
} as const

/** The seeded history: a cited answer, a reasoning-and-tool answer, a stopped one and a model switch. */
function seedMessages(): Map<string, ChatMessageDto[]> {
  return new Map<string, ChatMessageDto[]>([
    [
      CHATS.refunds,
      [
        userText(1, CHATS.refunds, 'Can a customer cancel an annual plan and get a refund?'),
        assistant(
          2,
          CHATS.refunds,
          [
            {
              type: 'text',
              text: 'Yes. Customers may cancel an annual plan within **14 days** of purchase for a full refund [1]. After that, the unused months are credited rather than refunded [2].',
            },
            knowledgeSource(
              1,
              'Refund policy.pdf',
              'Customers may cancel within 14 days of purchase for a full refund.',
              2,
            ),
            knowledgeSource(
              2,
              'Annual plans FAQ',
              'After 14 days the unused months are credited to the account.',
            ),
          ],
          { feedback: null },
        ),
      ],
    ],
    [
      CHATS.quarterly,
      [
        userText(3, CHATS.quarterly, 'Summarize the revenue lines by region.'),
        assistant(
          4,
          CHATS.quarterly,
          [
            {
              type: 'reasoning',
              text: 'The report lists three regions. I add each region’s product and services lines, then compare them with last quarter.',
              durationMs: 3200,
            },
            {
              type: 'tool',
              toolCallId: 'call-1',
              toolName: 'search_knowledge',
              state: 'done',
              input: { query: 'revenue by region' },
              output: { results: 3 },
            },
            {
              type: 'text',
              text: 'Revenue grew in all three regions:\n\n| Region | Revenue | Change |\n| --- | --- | --- |\n| Europe | €4.2M | +8% |\n| Americas | €5.1M | +12% |\n| Asia-Pacific | €2.3M | +3% |\n\n```sql\nSELECT region, SUM(amount) FROM revenue GROUP BY region;\n```',
            },
          ],
          { feedback: null },
        ),
        userText(5, CHATS.quarterly, 'Draft two sentences for the board.'),
        assistant(6, CHATS.quarterly, [
          { type: 'model-switch', fromModelKey: OLD_MODEL_KEY, toModelKey: MOCK_MODEL.modelKey },
          {
            type: 'text',
            text: 'Revenue rose 8% to €11.6M, led by the Americas. We expect the same pace next quarter.',
          },
        ]),
        userText(7, CHATS.quarterly, 'Now add the outlook.'),
        assistant(
          8,
          CHATS.quarterly,
          [
            { type: 'text', text: 'Looking ahead, we expect' },
            { type: 'data', name: 'stopped', data: {} },
          ],
          { status: 'stopped' },
        ),
      ],
    ],
    [
      CHATS.onboarding,
      [
        userText(9, CHATS.onboarding, 'A first-week checklist for new engineers.'),
        assistant(
          10,
          CHATS.onboarding,
          [
            {
              type: 'text',
              text: 'Day 1: laptop, accounts and a walk through the repository. Day 2: pair on a small fix.',
            },
            { type: 'data', name: 'sources-processing', data: { count: 2 } },
          ],
          { feedback: null },
        ),
      ],
    ],
  ])
}

/** Bumped on reset: an answer still streaming from before it stops and stores nothing. */
let generation = 0
let messages = seedMessages()
let attachments = new Map<string, ChatAttachmentDto>()
let ordinal = 100

const nextId = () => fixtureUuid(MESSAGE_KIND, ++ordinal)

/** Back to the seeded history; tests call it between cases. */
export function resetChatMessagesMock(): void {
  generation += 1
  messages = seedMessages()
  attachments = new Map()
  ordinal = 100
  streamDelayMs = 25
}

/** Messages of a chat; a seeded chat without a scripted history gets one question and one answer. */
function messagesOf(store: ChatStore, chatId: string): ChatMessageDto[] {
  const existing = messages.get(chatId)
  if (existing) return existing
  const found = store.find(chatId)
  if (!found || found.chat.messageCount === 0) return []
  const history = [
    userText(nextOrdinal(), chatId, found.text),
    assistant(nextOrdinal(), chatId, [{ type: 'text', text: 'Here is a short answer.' }]),
  ]
  messages.set(chatId, history)
  return history
}

function nextOrdinal(): number {
  return ++ordinal
}

const encoder = new TextEncoder()
const sleep = (ms: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, ms)
  })

type Chunk = Record<string, unknown>

const sseHeaders = {
  'content-type': 'text/event-stream',
  'cache-control': 'no-cache',
  'x-vercel-ai-ui-message-stream': 'v1',
}

/** A streamed answer in the AI SDK UI message stream format; `produce` stops when `isAborted()`. */
function sseResponse(
  signal: AbortSignal,
  produce: (write: (chunk: Chunk) => void, isAborted: () => boolean) => Promise<boolean>,
): Response {
  let isAborted = false
  const startedIn = generation
  signal.addEventListener('abort', () => {
    isAborted = true
  })
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const write = (chunk: Chunk) => {
        if (isAborted) return
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(chunk)}\n\n`))
        } catch {
          // the reader closed the stream first (Stop): the rest is not sent
          isAborted = true
        }
      }
      try {
        const isFinished = await produce(write, () => isAborted || startedIn !== generation)
        // an `error` chunk ends the answer: the reader stops there and nothing more is sent
        if (!isAborted && isFinished) {
          controller.enqueue(encoder.encode('data: [DONE]\n\n'))
          controller.close()
        }
      } catch {
        // the reader went away (Stop) while the answer was ending: nothing is left to tell
      }
    },
    cancel() {
      isAborted = true
    },
  })
  return new Response(stream, { headers: sseHeaders })
}

interface AnswerPlan {
  reasoning?: string
  tool?: {
    name: string
    input: Record<string, string | number>
    output: Record<string, string | number>
  }
  text: string
  sources: SourcePart[]
}

const KNOWLEDGE_ANSWER_SOURCES: SourcePart[] = [
  knowledgeSource(1, 'Refund policy.pdf', 'Customers may cancel within 14 days.', 2),
  knowledgeSource(2, 'Annual plans FAQ', 'Unused months are credited after 14 days.'),
]

/** What the mock answers: grounded in knowledge unless the scope is `none`; "why"/"search"/"code" add parts. */
function planAnswer(text: string, chat: ChatDto): AnswerPlan {
  const lower = text.toLowerCase()
  const hasKnowledge = chat.knowledgeScope !== 'none'
  const body = [
    `You asked: “${text.slice(0, 80)}”.`,
    hasKnowledge
      ? 'According to the policy, annual plans can be cancelled within 14 days for a full refund [1]. Later, the unused months are credited [2].'
      : 'Here is a short answer from the model, without searching your knowledge.',
    lower.includes('code')
      ? '```ts\nexport const total = (items: number[]) => items.reduce((sum, item) => sum + item, 0)\n```'
      : 'Tell me if you want more detail.',
  ].join('\n\n')
  return {
    ...(lower.includes('why') || lower.includes('think')
      ? { reasoning: 'I compare the question with the policy wording before answering.' }
      : {}),
    ...(lower.includes('search')
      ? {
          tool: {
            name: 'search_knowledge',
            input: { query: text.slice(0, 40) },
            output: { results: 2 },
          },
        }
      : {}),
    text: body,
    sources: hasKnowledge ? KNOWLEDGE_ANSWER_SOURCES : [],
  }
}

const dataLocationOf = (modelKey: string): ChatModelData['dataLocation'] =>
  modelKey.startsWith('local/') ? 'local' : 'provider'

const modelRefOf = (modelKey: string): ChatModelData['model'] => {
  if (modelKey === MOCK_MODEL.modelKey) return { ...MOCK_MODEL }
  const isLocal = modelKey.startsWith('local/')
  return {
    modelKey,
    displayName: modelKey.split('/').at(-1) ?? modelKey,
    providerKey: isLocal ? 'ollama' : (modelKey.split('/')[0] ?? 'openai'),
    source: isLocal ? 'local' : 'provider',
  }
}

const errorChunkFor = (scenario: string) =>
  scenario === 'interrupted' ? ERROR_CODES.MODEL_PROVIDER_UNAVAILABLE : null

interface StreamContext {
  chat: ChatDto
  assistantId: string
  userMessageId: string | null
  modelKey: string
  plan: AnswerPlan
  scenario: string
  isNewChat: boolean
  /** Text already streamed by an earlier message, for `continue`. */
  prefix: string
  /** The model the chat used before this answer, when it changed: the answer starts with a divider. */
  switchedFrom: string | null
}

async function streamAnswer(
  context: StreamContext,
  write: (chunk: Chunk) => void,
  isAborted: () => boolean,
  store: ChatStore,
  list: ChatMessageDto[],
): Promise<boolean> {
  const { chat, plan, modelKey, assistantId, scenario } = context
  const started = Date.now()
  write({ type: 'start', messageId: assistantId })
  write({
    type: 'data-message',
    data: { userMessageId: context.userMessageId, assistantMessageId: assistantId },
  })
  write({ type: 'start-step' })
  write({
    type: 'data-model',
    data: {
      model: modelRefOf(modelKey),
      dataLocation: dataLocationOf(modelKey),
      piiMasked: false,
      routed: false,
      fallback: null,
    },
  })
  await sleep(streamDelayMs * 4)

  const parts: ChatMessagePart[] = []
  if (plan.reasoning) {
    write({ type: 'reasoning-start', id: 'r1' })
    write({ type: 'reasoning-delta', id: 'r1', delta: plan.reasoning })
    write({ type: 'reasoning-end', id: 'r1' })
    parts.push({ type: 'reasoning', text: plan.reasoning, durationMs: 1200 })
  }
  if (plan.tool) {
    write({
      type: 'tool-input-available',
      toolCallId: 'call-1',
      toolName: plan.tool.name,
      input: plan.tool.input,
      dynamic: true,
    })
    write({ type: 'tool-output-available', toolCallId: 'call-1', output: plan.tool.output })
    parts.push({
      type: 'tool',
      toolCallId: 'call-1',
      toolName: plan.tool.name,
      state: 'done',
      input: plan.tool.input,
      output: plan.tool.output,
    })
  }

  const words = plan.text.split(/(?<=\s)/)
  const interruptAt = scenario === 'interrupted' ? Math.ceil(words.length / 2) : words.length
  let streamed = ''
  write({ type: 'text-start', id: 't1' })
  for (const [position, word] of words.slice(0, interruptAt).entries()) {
    if (isAborted()) break
    write({ type: 'text-delta', id: 't1', delta: word })
    streamed += word
    if (position % 2 === 0) await sleep(streamDelayMs)
  }
  write({ type: 'text-end', id: 't1' })

  const persist = (status: ChatMessageDto['status'], extra: ChatMessagePart[] = []) => {
    const text = `${context.prefix}${streamed}`
    if (context.switchedFrom) {
      parts.unshift({
        type: 'model-switch',
        fromModelKey: context.switchedFrom,
        toModelKey: modelKey,
      })
    }
    parts.push({ type: 'text', text })
    if (status === 'complete') parts.push(...plan.sources)
    parts.push(...extra)
    list.push(
      assistant(nextOrdinal(), chat.id, parts, {
        id: assistantId,
        status,
        modelKey,
        dataLocation: dataLocationOf(modelKey),
        errorCode: status === 'interrupted' ? ERROR_CODES.MODEL_PROVIDER_UNAVAILABLE : null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        usage: usage(Math.max(1, Math.round(streamed.length / 4))),
      }),
    )
    const latest = store.find(chat.id)?.chat ?? chat
    store.update({
      ...latest,
      messageCount: list.length,
      lastMessageAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    })
  }

  if (isAborted()) {
    persist('stopped', [{ type: 'data', name: 'stopped', data: {} }])
    return true
  }
  const errorCode = errorChunkFor(scenario)
  if (errorCode) {
    write({ type: 'error', errorText: errorCode })
    persist('interrupted')
    return false
  }

  if (!isAborted() && plan.sources.length > 0) {
    for (const source of plan.sources) {
      write({
        type: 'source-url',
        sourceId: `source-${source.index}`,
        url: `https://knowledge.local/${source.documentId ?? source.index}`,
        title: source.title,
      })
    }
  }
  write({ type: 'finish-step' })
  const outputTokens = Math.max(1, Math.round(streamed.length / 4))
  write({
    type: 'data-usage',
    data: { ...usage(outputTokens), latencyMs: Date.now() - started },
  })
  if (context.isNewChat) {
    write({ type: 'data-title', data: { title: chat.title || 'New conversation' } })
  }
  write({ type: 'finish' })
  persist('complete')
  return true
}

const path = '/orgs/:orgId/chats/:chatId'
const messagesPath = `${path}/messages`
const noContent = () => new Response(null, { status: 204 })
const chatNotFound = () => mockError(HTTP_NOT_FOUND, ERROR_CODES.CHAT_NOT_FOUND, 'Chat not found')
const messageNotFound = () =>
  mockError(HTTP_NOT_FOUND, ERROR_CODES.CHAT_MESSAGE_NOT_FOUND, 'Message not found')

function titleFrom(text: string): string {
  const title = text.replaceAll(/\s+/g, ' ').trim().slice(0, 48)
  return title.length > 0 ? title : 'New conversation'
}

function newChatFrom(chatId: string, text: string, modelKey: string, input: unknown): ChatDto {
  const settings = (input ?? {}) as {
    folderId?: string | null
    isPrivate?: boolean
    knowledgeScope?: ChatDto['knowledgeScope']
    knowledgeBaseIds?: string[]
  }
  const now = new Date().toISOString()
  return {
    id: chatId,
    title: titleFrom(text),
    titleGenerated: true,
    folderId: settings.folderId ?? null,
    isPinned: false,
    pinnedAt: null,
    isPrivate: settings.isPrivate ?? false,
    agentId: null,
    knowledgeScope: settings.knowledgeScope ?? 'all',
    knowledgeBaseIds: settings.knowledgeBaseIds ?? [],
    currentModelKey: modelKey,
    lastMessageAt: now,
    messageCount: 0,
    matchedText: null,
    deletedAt: null,
    purgeAt: null,
    createdAt: now,
    updatedAt: now,
  }
}

const textOf = (message: ChatMessageDto) =>
  message.parts.parts.find((part) => part.type === 'text')?.text ?? ''

const sourceParts = (message: ChatMessageDto) =>
  message.parts.parts.filter((part): part is SourcePart => part.type === 'source')

type SendInput = z.infer<typeof sendChatMessageInputSchema>

interface SendContext {
  chatId: string
  list: ChatMessageDto[]
  modelKey: string
  previousModelKey: string | null
}

interface PreparedSend {
  userMessageId: string | null
  prompt: string
  switchedFrom: string | null
}

const fileParts = (attachmentIds: readonly string[]): ChatMessagePart[] =>
  attachmentIds.flatMap((attachmentId) => {
    const attachment = attachments.get(attachmentId)
    return attachment
      ? [
          {
            type: 'file' as const,
            attachmentId,
            mediaType: attachment.contentType,
            name: attachment.fileName,
          },
        ]
      : []
  })

/** Adds the person's message (submit, edit) or finds what to answer again (regenerate, continue). */
function applyInput(
  input: SendInput,
  { chatId, list, modelKey, previousModelKey }: SendContext,
): PreparedSend | { error: Response } {
  if (input.trigger === 'submit' || input.trigger === 'edit') {
    if (input.trigger === 'edit') {
      const at = list.findIndex((message) => message.id === input.messageId)
      if (at === -1) return { error: messageNotFound() }
      list.splice(at)
    }
    const userMessageId = nextId()
    const switchedFrom =
      previousModelKey !== null && previousModelKey !== modelKey && list.length > 0
        ? previousModelKey
        : null
    const now = new Date().toISOString()
    list.push(
      chatMessageFactory({
        id: userMessageId,
        chatId,
        parts: {
          version: 1,
          parts: [{ type: 'text', text: input.text }, ...fileParts(input.attachmentIds)],
        },
        createdAt: now,
        updatedAt: now,
      }),
    )
    return { userMessageId, prompt: input.text, switchedFrom }
  }
  const at = list.findIndex((message) => message.id === input.messageId)
  const target = list[at]
  if (!target) return { error: messageNotFound() }
  if (input.trigger === 'regenerate') list.splice(at, 1)
  else if (target.status !== 'stopped') {
    return {
      error: mockError(
        HTTP_CONFLICT,
        ERROR_CODES.CHAT_MESSAGE_STATE_INVALID,
        'Only a stopped answer can continue',
      ),
    }
  }
  const asked = list[at - 1]
  return { userMessageId: null, prompt: asked ? textOf(asked) : '', switchedFrom: null }
}

const FAILURE_CODES: Record<string, string> = {
  'model-offline': ERROR_CODES.MODEL_PROVIDER_UNAVAILABLE,
  'budget-reached': ERROR_CODES.BUDGET_EXCEEDED,
  'rate-limited': ERROR_CODES.RATE_LIMITED,
}

function failedAnswer(chatId: string, scenario: string, modelKey: string): ChatMessageDto {
  const now = new Date().toISOString()
  return assistant(
    nextOrdinal(),
    chatId,
    scenario === 'budget-reached'
      ? [{ type: 'data', name: 'budget-reached', data: { scope: 'user' } }]
      : [],
    {
      id: nextId(),
      status: 'failed',
      errorCode: FAILURE_CODES[scenario] ?? null,
      modelKey,
      usage: null,
      createdAt: now,
      updatedAt: now,
    },
  )
}

/** Scenarios that fail the request itself: no stream starts. */
function failureBeforeStream(scenario: string): Response | null {
  if (scenario === 'model-offline') {
    return mockError(
      HTTP_BAD_GATEWAY,
      ERROR_CODES.MODEL_PROVIDER_UNAVAILABLE,
      'The provider is not reachable',
    )
  }
  if (scenario === 'budget-reached') {
    return mockError(HTTP_PAYMENT_REQUIRED, ERROR_CODES.BUDGET_EXCEEDED, 'Budget reached')
  }
  if (scenario === 'rate-limited') {
    const response = mockError(HTTP_TOO_MANY, ERROR_CODES.RATE_LIMITED, 'Slow down')
    response.headers.set('retry-after', String(RETRY_AFTER_SECONDS))
    return response
  }
  return null
}

/**
 * The thread's routes (C-03 messages, feedback, sources and attachments) until the integration task
 * (I4-02) switches to the real API. `POST …/messages` answers a real SSE stream in the AI SDK UI
 * message stream format. Scenarios: `model-offline`, `budget-reached`, `rate-limited` fail before
 * the first byte; `interrupted` fails half way; `source-removed` and
 * `source-no-access` change the source preview; `attachment-too-large`, `attachment-unsupported`
 * and `attachment-upload-fails` fail the attachment steps.
 */
export function createChatMessageHandlers(store: ChatStore) {
  const requireChat = (chatId: unknown) => {
    const found = typeof chatId === 'string' ? store.find(chatId) : undefined
    return found && !found.chat.deletedAt ? found : null
  }

  return [
    defineMockHandler({
      method: 'get',
      path: messagesPath,
      response: pageResponse(chatMessageDtoSchema),
      scenarios: {
        default: ({ params, request }) => {
          if (!requireChat(params.chatId)) return chatNotFound()
          const url = new URL(request.url)
          const limit = Number(url.searchParams.get('limit') ?? PAGE_SIZE.default)
          const start = Number(url.searchParams.get('cursor') ?? 0)
          const ordered = [...messagesOf(store, String(params.chatId))].sort((a, b) =>
            a.createdAt.localeCompare(b.createdAt),
          )
          const items =
            url.searchParams.get('sort') === '-createdAt' ? ordered.toReversed() : ordered
          const next = start + limit < items.length ? String(start + limit) : null
          return mockPage(items.slice(start, start + limit), next)
        },
      },
    }),
    defineMockHandler({
      method: 'post',
      path: messagesPath,
      response: okResponse(z.null()),
      scenarios: {
        default: async ({ params, request, scenario }) => {
          const chatId = String(params.chatId)
          const input = sendChatMessageInputSchema.parse(await request.json())
          const existing = requireChat(chatId)
          const isNewChat = !existing && input.trigger === 'submit'
          if (!existing && !isNewChat) return chatNotFound()

          const modelKey =
            ('modelKey' in input ? input.modelKey : undefined) ??
            existing?.chat.currentModelKey ??
            MOCK_MODEL.modelKey
          const chat =
            existing?.chat ??
            newChatFrom(
              chatId,
              input.trigger === 'submit' ? input.text : '',
              modelKey,
              input.trigger === 'submit' ? input.newChat : undefined,
            )
          if (isNewChat) store.create(chat)
          const list = isNewChat ? [] : messagesOf(store, chatId)
          if (isNewChat) messages.set(chatId, list)

          const prepared = applyInput(input, {
            chatId,
            list,
            modelKey,
            previousModelKey: existing?.chat.currentModelKey ?? null,
          })
          if ('error' in prepared) return prepared.error
          store.update({ ...chat, currentModelKey: modelKey })

          // The failures that happen before the first byte: the person's message is kept.
          const failure = failureBeforeStream(scenario)
          if (failure) {
            // the server records a failed answer, so Retry has a message to answer again
            list.push(failedAnswer(chatId, scenario, modelKey))
            store.update({ ...chat, messageCount: list.length, currentModelKey: modelKey })
            return failure
          }

          const plan = planAnswer(prepared.prompt, chat)
          return sseResponse(request.signal, (write, isAborted) =>
            streamAnswer(
              {
                chat: isNewChat ? { ...chat, messageCount: 0 } : chat,
                assistantId: nextId(),
                userMessageId: prepared.userMessageId,
                modelKey,
                plan:
                  input.trigger === 'continue'
                    ? { text: '…and the rest of the answer follows.', sources: [] }
                    : plan,
                scenario,
                isNewChat,
                prefix: '',
                switchedFrom: prepared.switchedFrom,
              },
              write,
              isAborted,
              store,
              list,
            ),
          )
        },
      },
    }),
    defineMockHandler({
      method: 'put',
      path: `${messagesPath}/:messageId/feedback`,
      response: okResponse(chatFeedbackDtoSchema),
      scenarios: {
        default: async ({ params, request }) => {
          const list = messages.get(String(params.chatId))
          const target = list?.find((message) => message.id === params.messageId)
          if (!list || !target) return messageNotFound()
          const input = setChatFeedbackInputSchema.parse(await request.json())
          const feedback = {
            rating: input.rating,
            correctionText: input.correctionText ?? null,
            updatedAt: new Date().toISOString(),
          }
          messages.set(
            String(params.chatId),
            list.map((message) => (message.id === target.id ? { ...message, feedback } : message)),
          )
          return mockOk(feedback)
        },
      },
    }),
    defineMockHandler({
      method: 'delete',
      path: `${messagesPath}/:messageId/feedback`,
      response: okResponse(z.null()),
      scenarios: {
        default: ({ params }) => {
          const list = messages.get(String(params.chatId))
          if (!list?.some((message) => message.id === params.messageId)) return messageNotFound()
          messages.set(
            String(params.chatId),
            list.map((message) =>
              message.id === params.messageId ? { ...message, feedback: null } : message,
            ),
          )
          return noContent()
        },
      },
    }),
    defineMockHandler({
      method: 'get',
      path: `${messagesPath}/:messageId/sources/:index`,
      response: okResponse(chatSourcePreviewDtoSchema),
      scenarios: {
        default: ({ params, scenario }) => {
          const target = messages
            .get(String(params.chatId))
            ?.find((message) => message.id === params.messageId)
          const source = target
            ? sourceParts(target).find((part) => part.index === Number(params.index))
            : undefined
          if (!source) return messageNotFound()
          const base = {
            index: source.index,
            kind: source.kind,
            title: source.title,
            page: source.page ?? null,
            url: source.url ?? null,
            knowledgeBaseId: source.knowledgeBaseId ?? null,
            documentId: source.documentId ?? null,
            chunkId: source.chunkId ?? null,
          }
          if (scenario === 'source-removed') {
            return mockOk({ ...base, status: 'removed', passage: null, canOpenInKnowledge: false })
          }
          if (scenario === 'source-no-access') {
            return mockOk({
              ...base,
              status: 'no_access',
              passage: null,
              canOpenInKnowledge: false,
            })
          }
          return mockOk({
            ...base,
            status: 'available',
            passage: `${source.snippet} The paragraph continues with the details the answer relied on.`,
            canOpenInKnowledge: source.knowledgeBaseId !== undefined,
          })
        },
      },
    }),
    defineMockHandler({
      method: 'post',
      path: `${path}/attachments`,
      response: okResponse(chatAttachmentUploadDtoSchema),
      scenarios: {
        default: async ({ params, request }) => {
          const input = requestChatAttachmentUploadInputSchema.parse(await request.json())
          const isImage = (CHAT_IMAGE_TYPES as readonly string[]).includes(input.contentType)
          const attachment: ChatAttachmentDto = {
            id: fixtureUuid(ATTACHMENT_KIND, ++ordinal),
            chatId: String(params.chatId),
            messageId: null,
            fileName: input.fileName,
            contentType: input.contentType,
            sizeBytes: input.sizeBytes,
            kind: isImage ? 'image' : 'document',
            status: 'uploading',
            errorCode: null,
            pageCount: null,
            createdAt: new Date().toISOString(),
          }
          attachments.set(attachment.id, attachment)
          return mockOk(
            {
              attachment,
              upload: {
                url: `${new URL(request.url).origin}/api/v1/mock-storage/chat-attachments/${attachment.id}`,
                method: 'PUT' as const,
                headers: {},
                expiresAt: new Date(Date.now() + HOUR_MS).toISOString(),
              },
            },
            { status: 201 },
          )
        },
        'attachment-too-large': () =>
          mockError(
            HTTP_UNPROCESSABLE,
            ERROR_CODES.CHAT_ATTACHMENT_TOO_LARGE,
            `Over ${String(CHAT_ATTACHMENT_LIMITS.maxImageBytes)} bytes`,
          ),
        'attachment-unsupported': () =>
          mockError(
            HTTP_UNPROCESSABLE,
            ERROR_CODES.CHAT_ATTACHMENT_UNSUPPORTED,
            `Accepted: ${CHAT_ATTACHMENT_TYPES.join(', ')}`,
          ),
      },
    }),
    defineMockHandler({
      method: 'put',
      path: '/mock-storage/chat-attachments/:attachmentId',
      response: okResponse(z.null()),
      scenarios: {
        default: () => noContent(),
        'attachment-upload-fails': () =>
          mockError(HTTP_BAD_GATEWAY, ERROR_CODES.CHAT_ATTACHMENT_UPLOAD_FAILED, 'Storage failed'),
      },
    }),
    defineMockHandler({
      method: 'post',
      path: `${path}/attachments/:attachmentId/complete`,
      response: okResponse(chatAttachmentDtoSchema),
      scenarios: {
        default: ({ params }) => {
          const found = attachments.get(String(params.attachmentId))
          if (!found) {
            return mockError(
              HTTP_NOT_FOUND,
              ERROR_CODES.CHAT_ATTACHMENT_NOT_FOUND,
              'Attachment not found',
            )
          }
          const ready: ChatAttachmentDto = {
            ...found,
            status: 'ready',
            pageCount: found.kind === 'document' ? 3 : null,
          }
          attachments.set(ready.id, ready)
          return mockOk(ready)
        },
      },
    }),
    defineMockHandler({
      method: 'post',
      path: `${path}/attachments/:attachmentId/retry`,
      response: okResponse(chatAttachmentUploadDtoSchema),
      scenarios: {
        default: ({ params, request }) => {
          const found = attachments.get(String(params.attachmentId))
          if (!found) {
            return mockError(
              HTTP_NOT_FOUND,
              ERROR_CODES.CHAT_ATTACHMENT_NOT_FOUND,
              'Attachment not found',
            )
          }
          const attachment: ChatAttachmentDto = { ...found, status: 'uploading', errorCode: null }
          attachments.set(attachment.id, attachment)
          return mockOk({
            attachment,
            upload: {
              url: `${new URL(request.url).origin}/api/v1/mock-storage/chat-attachments/${attachment.id}`,
              method: 'PUT' as const,
              headers: {},
              expiresAt: new Date(Date.now() + HOUR_MS).toISOString(),
            },
          })
        },
      },
    }),
    defineMockHandler({
      method: 'delete',
      path: `${path}/attachments/:attachmentId`,
      response: okResponse(z.null()),
      scenarios: {
        default: ({ params }) => {
          attachments.delete(String(params.attachmentId))
          return noContent()
        },
      },
    }),
  ]
}
