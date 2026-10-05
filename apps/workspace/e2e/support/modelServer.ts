// SPDX-License-Identifier: AGPL-3.0-only
// A local OpenAI-compatible server for the end-to-end run, started by Playwright next to the API.
// It knows one model and answers every chat with a predictable text, streamed word by word, so
// the specs can wait for the answer, stop it midway, regenerate it and edit the question.
import { createServer } from 'node:http'

import { e2e, LONG_ANSWER_PREFIX, STUB_MODEL_ID, stubTitle } from './env'

import type { IncomingMessage, ServerResponse } from 'node:http'

/** Time between two streamed words: long enough to see "Stop answering", short for the run. */
const WORD_DELAY_MS = 40

const LONG_ANSWER_WORDS = 400

interface ChatMessage {
  role: string
  content: string | { type: string; text?: string }[] | null
}

const textOf = (content: ChatMessage['content']) =>
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

async function completions(request: IncomingMessage, response: ServerResponse) {
  const body = (await readJson(request)) as {
    model: string
    stream?: boolean
    messages: ChatMessage[]
  }
  const answer = stubAnswer(body.messages)
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

  response.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' })
  const event = (data: unknown) => response.write(`data: ${JSON.stringify(data)}\n\n`)
  const chunk = (delta: object, finishReason: string | null) => ({
    ...base,
    object: 'chat.completion.chunk',
    choices: [{ index: 0, delta, finish_reason: finishReason }],
  })

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

const server = createServer((request, response) => {
  const path = new URL(request.url ?? '/', 'http://localhost').pathname
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
