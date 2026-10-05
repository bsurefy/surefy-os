// SPDX-License-Identifier: AGPL-3.0-only
import { createAiProviders, type AiProviders, type Fetch } from '@/integrations/ai/index.js'

/** How the fake answers the next calls: normally, with an HTTP failure, or not at all. */
export type FakeAiMode =
  { kind: 'ok' } | { kind: 'status'; status: number; body: string } | { kind: 'offline' }

export interface FakeAiCall {
  url: string
  method: string
  headers: Headers
  body: unknown
}

export interface FakeAi {
  providers: AiProviders
  calls: FakeAiCall[]
  /** Answer every later call this way; `ok` restores the normal answers. */
  setMode(mode: FakeAiMode): void
  /** Answer calls to URLs containing `match` this way (for one model or server). */
  failWhen(match: string, mode: FakeAiMode): void
  reset(): void
  /** The text every chat completion answers. */
  reply: string
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

const FAKE_REPLY = 'Hello from the fake provider'
const EMBEDDING_SIZE = 1536

/** Model lists in each provider's own format. */
function modelList(url: URL): unknown {
  if (url.hostname === 'api.anthropic.com') {
    return { data: [{ id: 'claude-sonnet-5-5', display_name: 'Claude Sonnet 5.5' }] }
  }
  if (url.hostname === 'generativelanguage.googleapis.com') {
    return {
      models: [
        { name: 'models/gemini-2.5-flash', supportedGenerationMethods: ['generateContent'] },
        { name: 'models/text-embedding-004', supportedGenerationMethods: ['embedContent'] },
      ],
    }
  }
  if (url.hostname === 'api.openai.com') {
    return { data: [{ id: 'gpt-4.1' }, { id: 'gpt-4.1-mini' }, { id: 'text-embedding-3-small' }] }
  }
  // a local server: Ollama, LM Studio, vLLM…
  return { data: [{ id: 'llama3.1:8b' }, { id: 'qwen2.5:7b' }] }
}

function chatCompletion(model: string, reply: string): unknown {
  return {
    id: 'chatcmpl-fake',
    object: 'chat.completion',
    created: 1,
    model,
    choices: [{ index: 0, message: { role: 'assistant', content: reply }, finish_reason: 'stop' }],
    usage: { prompt_tokens: 12, completion_tokens: 6, total_tokens: 18 },
  }
}

/** The same answer as streamed chunks, two words at a time, then usage. */
function chatChunks(model: string, reply: string): unknown[] {
  const base = { id: 'chatcmpl-fake', object: 'chat.completion.chunk', created: 1, model }
  const words = reply.split(' ')
  return [
    {
      ...base,
      choices: [{ index: 0, delta: { role: 'assistant', content: '' }, finish_reason: null }],
    },
    ...words.map((word, index) => ({
      ...base,
      choices: [
        { index: 0, delta: { content: index === 0 ? word : ` ${word}` }, finish_reason: null },
      ],
    })),
    { ...base, choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] },
    { ...base, choices: [], usage: { prompt_tokens: 12, completion_tokens: 6, total_tokens: 18 } },
  ]
}

/** OpenAI's Responses API answer (the OpenAI adapter's default endpoint). */
function openAiResponse(model: string, reply: string): unknown {
  return {
    id: 'resp_fake',
    object: 'response',
    created_at: 1,
    status: 'completed',
    model,
    output: [
      {
        type: 'message',
        id: 'msg_fake',
        status: 'completed',
        role: 'assistant',
        content: [{ type: 'output_text', text: reply, annotations: [] }],
      },
    ],
    incomplete_details: null,
    usage: {
      input_tokens: 12,
      input_tokens_details: { cached_tokens: 0 },
      output_tokens: 6,
      output_tokens_details: { reasoning_tokens: 0 },
      total_tokens: 18,
    },
  }
}

const sseEvent = (data: string) => `data: ${data}\n\n`

const sse = (chunks: unknown[]) =>
  new Response(
    chunks.map((chunk) => sseEvent(JSON.stringify(chunk))).join('') + sseEvent('[DONE]'),
    {
      status: 200,
      headers: { 'content-type': 'text/event-stream' },
    },
  )

/**
 * A provider-shaped fake behind `createAiProviders({ fetch })`: tests never reach a real provider.
 * It lists models in each provider's format and answers OpenAI-style chat completions and
 * embeddings, so the gateway runs the real AI SDK code paths.
 */
export function createFakeAi(): FakeAi {
  let mode: FakeAiMode = { kind: 'ok' }
  const rules: { match: string; mode: FakeAiMode }[] = []
  const calls: FakeAiCall[] = []
  const fake: FakeAi = {
    providers: createAiProviders(),
    calls,
    setMode: (next) => {
      mode = next
    },
    failWhen: (match, next) => {
      rules.push({ match, mode: next })
    },
    reset: () => {
      mode = { kind: 'ok' }
      rules.length = 0
      calls.length = 0
    },
    reply: FAKE_REPLY,
  }
  const answer = (input: Parameters<Fetch>[0], init: Parameters<Fetch>[1]): Response => {
    const url = new URL(input instanceof Request ? input.url : input.toString())
    const text = typeof init?.body === 'string' ? init.body : undefined
    const body: unknown = text === undefined ? undefined : JSON.parse(text)
    calls.push({
      url: url.toString(),
      method: init?.method ?? 'GET',
      headers: new Headers(init?.headers),
      body,
    })
    const active = rules.find((rule) => url.toString().includes(rule.match))?.mode ?? mode
    if (active.kind === 'offline') throw new TypeError('fetch failed')
    if (active.kind === 'status') return new Response(active.body, { status: active.status })
    if (url.pathname.endsWith('/models')) return json(modelList(url))
    if (url.pathname.endsWith('/chat/completions')) {
      const request = body as { model?: string; stream?: boolean } | undefined
      const model = request?.model ?? 'unknown'
      return request?.stream === true
        ? sse(chatChunks(model, fake.reply))
        : json(chatCompletion(model, fake.reply))
    }
    if (url.pathname.endsWith('/responses')) {
      const model = (body as { model?: string } | undefined)?.model ?? 'unknown'
      return json(openAiResponse(model, fake.reply))
    }
    if (url.pathname.endsWith('/embeddings')) {
      const inputs = (body as { input?: unknown[] } | undefined)?.input ?? []
      return json({
        object: 'list',
        data: inputs.map((_, index) => ({
          object: 'embedding',
          index,
          embedding: new Array<number>(EMBEDDING_SIZE).fill(0.01),
        })),
        model: (body as { model?: string } | undefined)?.model ?? 'unknown',
        usage: { prompt_tokens: inputs.length * 4, total_tokens: inputs.length * 4 },
      })
    }
    return json({ error: `fake AI has no answer for ${url.pathname}` }, 404)
  }
  const fetchFn: Fetch = (input, init) => {
    try {
      return Promise.resolve(answer(input, init))
    } catch (error) {
      return Promise.reject(error instanceof Error ? error : new Error(String(error)))
    }
  }
  fake.providers = createAiProviders({ fetch: fetchFn })
  return fake
}

/** A provider key for tests: `sk-<label>`, built at run time so no key-shaped literal is committed. */
export const testKey = (label: string): string => ['sk', label].join('-')
