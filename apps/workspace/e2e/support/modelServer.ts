// SPDX-License-Identifier: AGPL-3.0-only
// A local OpenAI-compatible server for the end-to-end run, started by Playwright next to the API.
// It knows one model and answers every chat with a predictable text, streamed word by word, so
// the specs can wait for the answer, stop it midway, regenerate it and edit the question.
import { createServer } from 'node:http'

import {
  e2e,
  EMBED_DIMENSIONS,
  EMBED_MODEL_ID,
  LONG_ANSWER_PREFIX,
  STUB_MODEL_ID,
  stubTitle,
} from './env'

import type { IncomingMessage, ServerResponse } from 'node:http'

/** Time between two streamed words: long enough to see "Stop answering", short for the run. */
const WORD_DELAY_MS = 40

const LONG_ANSWER_WORDS = 400

interface ChatMessage {
  role: string
  content: string | { type: string; text?: string }[] | null
}

interface ToolDefinition {
  type: string
  function: { name: string; description?: string }
}

/** One function call the stub asks for, in place of an answer. */
interface ToolCall {
  name: string
  arguments: Record<string, unknown>
}

const textOf = (content: ChatMessage['content'] | undefined) =>
  typeof content === 'string'
    ? content
    : (content ?? []).map((part) => (part.type === 'text' ? (part.text ?? '') : '')).join('')

/**
 * "Echo: <the last question>", or a long text for questions that ask for one. A chat title
 * request (its system message asks for a title) gets the question's first words.
 */
function stubAnswer(messages: ChatMessage[]): string {
  const question = textOf(
    messages.filter((message) => message.role === 'user').at(-1)?.content ?? '',
  )
  const system = textOf(messages.find((message) => message.role === 'system')?.content ?? '')
  if (system.startsWith('Write a title')) return stubTitle(question)
  if (question.startsWith(LONG_ANSWER_PREFIX))
    return Array.from({ length: LONG_ANSWER_WORDS }, (_, i) => `word${String(i)}`).join(' ')
  return `Echo: ${question}`
}

/** An agent's question the stub answers with a call: "Refund order 1182 for $340". */
const REFUND_REQUEST = /^Refund order (\d+) for \$(\d+)/
/** Or with a call of the MCP server's lookup action: "Look up order 1182". */
const LOOKUP_REQUEST = /^Look up order (\d+)/

/**
 * What an agent run's model does (agents with tools offer them in `tools`): a refund request
 * calls the refund tool with the order and amount, and once a tool answered ("tool" message) the
 * stub says what the tool returned. Null when the request is not an agent's.
 */
function stubToolTurn(
  messages: ChatMessage[],
  tools: ToolDefinition[] | undefined,
): { call: ToolCall } | { text: string } | null {
  if (tools === undefined || tools.length === 0) return null
  const last = messages.at(-1)
  if (last?.role === 'tool') return { text: `Tool result: ${textOf(last.content)}` }
  const question = textOf(messages.filter((message) => message.role === 'user').at(-1)?.content)
  const refund = REFUND_REQUEST.exec(question)
  const refundTool = tools.find((entry) => entry.function.name.includes('refund'))
  if (refund !== null && refundTool !== undefined) {
    return {
      call: {
        name: refundTool.function.name,
        arguments: { orderId: refund[1], amount: Number(refund[2]) },
      },
    }
  }
  const lookup = LOOKUP_REQUEST.exec(question)
  const lookupTool = tools.find((entry) => entry.function.name.includes('lookup_order'))
  if (lookup === null || lookupTool === undefined) return null
  return { call: { name: lookupTool.function.name, arguments: { orderId: lookup[1] } } }
}

/** The decision mode's system prompt starts like this (`modelGateway.decision.ts`). */
const DECISION_SYSTEM_PREFIX = 'You make one decision'

/** A confident "yes", which is what lets a `can_act` call reach the approval rules. */
const DECISION_ANSWER = JSON.stringify({
  value: true,
  confidencePercent: 95,
  reasoning: 'The request matches the agent instructions.',
})

async function readJson(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = []
  for await (const chunk of request) chunks.push(chunk as Buffer)
  return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')
}

const send = (response: ServerResponse, status: number, body: unknown) => {
  response.writeHead(status, { 'content-type': 'application/json' })
  response.end(JSON.stringify(body))
}

const usageOf = (prompt: string, answer: string) => {
  const promptTokens = prompt.split(/\s+/).length
  const completionTokens = answer.split(/\s+/).length
  return {
    prompt_tokens: promptTokens,
    completion_tokens: completionTokens,
    total_tokens: promptTokens + completionTokens,
  }
}

const sleep = (ms: number) =>
  new Promise((resolve) => {
    setTimeout(resolve, ms)
  })

/** Opens an event stream and returns the writers for its data events and chunks. */
function openStream(response: ServerResponse, base: object) {
  response.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' })
  const event = (data: unknown) => response.write(`data: ${JSON.stringify(data)}\n\n`)
  const chunk = (delta: object, finishReason: string | null) => ({
    ...base,
    object: 'chat.completion.chunk',
    choices: [{ index: 0, delta, finish_reason: finishReason }],
  })
  return { event, chunk }
}

/** The text of every chat request the server was sent, oldest first (`GET /control/requests`). */
const received: string[] = []

async function completions(request: IncomingMessage, response: ServerResponse) {
  const body = (await readJson(request)) as {
    model: string
    stream?: boolean
    messages: ChatMessage[]
    tools?: ToolDefinition[]
  }
  received.push(body.messages.map((message) => textOf(message.content)).join('\n'))
  const system = textOf(body.messages.find((message) => message.role === 'system')?.content)
  const turn = system.startsWith(DECISION_SYSTEM_PREFIX)
    ? { text: DECISION_ANSWER }
    : stubToolTurn(body.messages, body.tools)
  if (turn !== null && 'call' in turn) {
    await toolCall(response, body, turn.call)
    return
  }
  const answer = turn === null ? stubAnswer(body.messages) : turn.text
  const usage = usageOf(body.messages.map((message) => textOf(message.content)).join(' '), answer)
  const base = {
    id: `chatcmpl-${String(Date.now())}`,
    created: Math.floor(Date.now() / 1000),
    model: body.model,
  }

  if (!body.stream) {
    send(response, 200, {
      ...base,
      object: 'chat.completion',
      choices: [
        { index: 0, message: { role: 'assistant', content: answer }, finish_reason: 'stop' },
      ],
      usage,
    })
    return
  }

  const { event, chunk } = openStream(response, base)

  event(chunk({ role: 'assistant', content: '' }, null))
  const words = answer.split(' ')
  for (const [index, word] of words.entries()) {
    // the API stopped reading: the person stopped the answer
    if (response.destroyed) return
    await sleep(WORD_DELAY_MS)
    event(chunk({ content: index === 0 ? word : ` ${word}` }, null))
  }
  event(chunk({}, 'stop'))
  event({ ...base, object: 'chat.completion.chunk', choices: [], usage })
  response.end('data: [DONE]\n\n')
}

/** Answers with one function call instead of text, streamed or not. */
async function toolCall(
  response: ServerResponse,
  body: { model: string; stream?: boolean; messages: ChatMessage[] },
  call: ToolCall,
) {
  const base = {
    id: `chatcmpl-${String(Date.now())}`,
    created: Math.floor(Date.now() / 1000),
    model: body.model,
  }
  const usage = usageOf(
    body.messages.map((message) => textOf(message.content)).join(' '),
    call.name,
  )
  const call0 = {
    id: 'call_1',
    type: 'function',
    function: { name: call.name, arguments: JSON.stringify(call.arguments) },
  }
  if (body.stream !== true) {
    send(response, 200, {
      ...base,
      object: 'chat.completion',
      choices: [
        {
          index: 0,
          message: { role: 'assistant', content: null, tool_calls: [call0] },
          finish_reason: 'tool_calls',
        },
      ],
      usage,
    })
    return
  }
  const { event, chunk } = openStream(response, base)
  event(chunk({ role: 'assistant', content: null }, null))
  await sleep(WORD_DELAY_MS)
  event(chunk({ tool_calls: [{ index: 0, ...call0 }] }, null))
  event(chunk({}, 'tool_calls'))
  event({ ...base, object: 'chat.completion.chunk', choices: [], usage })
  response.end('data: [DONE]\n\n')
}

const WORD = /[a-z0-9]+/g

/** A bag of words in a fixed number of buckets, normalized: texts that share words are close. */
function embedText(text: string): number[] {
  const vector = new Array<number>(EMBED_DIMENSIONS).fill(0)
  for (const word of text.toLowerCase().match(WORD) ?? []) {
    let hash = 0
    for (const char of word) hash = (hash * 31 + char.charCodeAt(0)) % 1_000_003
    vector[hash % EMBED_DIMENSIONS] = (vector[hash % EMBED_DIMENSIONS] ?? 0) + 1
  }
  const length = Math.hypot(...vector)
  if (length === 0) return vector.map((_, index) => (index === 0 ? 1 : 0))
  return vector.map((value) => value / length)
}

async function embeddings(request: IncomingMessage, response: ServerResponse) {
  const body = (await readJson(request)) as { input?: string | string[] }
  const inputs = Array.isArray(body.input) ? body.input : [body.input ?? '']
  send(response, 200, {
    object: 'list',
    model: EMBED_MODEL_ID,
    data: inputs.map((input, index) => ({
      object: 'embedding',
      index,
      embedding: embedText(input),
    })),
    usage: { prompt_tokens: inputs.length, total_tokens: inputs.length },
  })
}

const server = createServer((request, response) => {
  const path = new URL(request.url ?? '/', 'http://localhost').pathname
  if (request.method === 'GET' && path === '/embed/v1/models') {
    send(response, 200, {
      object: 'list',
      data: [{ id: EMBED_MODEL_ID, object: 'model', created: 0, owned_by: 'e2e' }],
    })
    return
  }
  if (request.method === 'POST' && path === '/embed/v1/embeddings') {
    embeddings(request, response).catch((error: unknown) => {
      send(response, 500, { error: { message: String(error) } })
    })
    return
  }
  if (path === '/control/requests') {
    if (request.method === 'DELETE') received.length = 0
    send(response, 200, received)
    return
  }
  if (request.method === 'GET' && path === '/v1/models') {
    send(response, 200, {
      object: 'list',
      data: [{ id: STUB_MODEL_ID, object: 'model', created: 0, owned_by: 'e2e' }],
    })
    return
  }
  if (request.method === 'POST' && path === '/v1/chat/completions') {
    completions(request, response).catch((error: unknown) => {
      send(response, 500, { error: { message: String(error) } })
    })
    return
  }
  send(response, 404, { error: { message: `No route for ${request.method ?? ''} ${path}` } })
})

server.listen(e2e.modelPort, '127.0.0.1')
