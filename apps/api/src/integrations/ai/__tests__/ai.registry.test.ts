// SPDX-License-Identifier: AGPL-3.0-only
import { generateText } from 'ai'
import { describe, expect, it, vi } from 'vitest'

import {
  apiBaseOf,
  createAiProviders,
  ProviderAuthError,
  ProviderRateLimitError,
  ProviderRegionError,
  ProviderTimeoutError,
  ProviderUnavailableError,
  type AiProviderCredentials,
  type Fetch,
} from '../index.js'

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

/** What each provider's models endpoint answers, in its own format. */
const MODEL_LISTS: Record<string, unknown> = {
  openai: { data: [{ id: 'gpt-4.1' }, { id: 'text-embedding-3-small' }] },
  anthropic: { data: [{ id: 'claude-sonnet-5-5', display_name: 'Claude Sonnet 5.5' }] },
  google: {
    models: [
      { name: 'models/gemini-2.5-flash', supportedGenerationMethods: ['generateContent'] },
      { name: 'models/text-embedding-004', supportedGenerationMethods: ['embedContent'] },
      { name: 'models/aqa', supportedGenerationMethods: ['generateAnswer'] },
    ],
  },
}
const OPENAI_STYLE = { data: [{ id: 'llama3.1:8b' }, { id: 'nomic-embed-text' }] }

const credentialsFor = (key: string): AiProviderCredentials =>
  ['openai', 'anthropic', 'google'].includes(key)
    ? { apiKey: 'sk-test-1234' }
    : { baseUrl: 'http://127.0.0.1:11434', apiKey: 'local-key' }

const signal = () => new AbortController().signal

describe('every AI provider', () => {
  const keys = createAiProviders().keys()

  it.each(keys)('%s lists its models in our shape', async (key) => {
    const fetchFn = vi.fn<Fetch>(() => Promise.resolve(json(MODEL_LISTS[key] ?? OPENAI_STYLE)))
    const provider = createAiProviders({ fetch: fetchFn }).get(key)
    const models = await provider?.listModels(credentialsFor(key), signal())
    expect(models?.length).toBeGreaterThan(0)
    for (const model of models ?? []) {
      expect(model.providerModelId).not.toBe('')
      expect(['chat', 'embedding']).toContain(model.type)
    }
  })

  it.each(keys)('%s turns a rejected key into ProviderAuthError', async (key) => {
    const fetchFn: Fetch = () => Promise.resolve(json({ error: 'invalid api key' }, 401))
    const provider = createAiProviders({ fetch: fetchFn }).get(key)
    await expect(provider?.listModels(credentialsFor(key), signal())).rejects.toBeInstanceOf(
      ProviderAuthError,
    )
  })

  it.each(keys)('%s turns a refused connection into ProviderUnavailableError', async (key) => {
    const fetchFn: Fetch = () => Promise.reject(new TypeError('fetch failed'))
    const provider = createAiProviders({ fetch: fetchFn }).get(key)
    await expect(provider?.listModels(credentialsFor(key), signal())).rejects.toBeInstanceOf(
      ProviderUnavailableError,
    )
  })

  it.each(keys)('%s turns an abort into ProviderTimeoutError', async (key) => {
    const controller = new AbortController()
    const fetchFn: Fetch = () => {
      controller.abort()
      return Promise.reject(new DOMException('aborted', 'AbortError'))
    }
    const provider = createAiProviders({ fetch: fetchFn }).get(key)
    await expect(
      provider?.listModels(credentialsFor(key), controller.signal),
    ).rejects.toBeInstanceOf(ProviderTimeoutError)
  })
})

describe('provider failures', () => {
  const failWith = (status: number, body: string) => {
    const openai = createAiProviders({
      fetch: () => Promise.resolve(new Response(body, { status })),
    }).get('openai')
    if (!openai) throw new Error('openai is registered')
    return openai.listModels({ apiKey: 'sk' }, signal())
  }

  it('tells a used-up quota from a short rate limit', async () => {
    const quota = await failWith(429, '{"error":{"code":"insufficient_quota"}}').catch(
      (e: unknown) => e,
    )
    expect(quota).toBeInstanceOf(ProviderRateLimitError)
    expect((quota as ProviderRateLimitError).isQuota).toBe(true)
    expect((quota as ProviderRateLimitError).reasonCode).toBe('VAULT_QUOTA_EXCEEDED')
    const limited = await failWith(429, 'slow down').catch((e: unknown) => e)
    expect((limited as ProviderRateLimitError).isQuota).toBe(false)
  })

  it('reports a region block', async () => {
    await expect(failWith(403, 'unsupported_country_region_territory')).rejects.toBeInstanceOf(
      ProviderRegionError,
    )
  })

  it('lets the gateway fall back on 5xx but not on a bad key', async () => {
    const down = await failWith(503, 'overloaded').catch((e: unknown) => e)
    expect((down as ProviderUnavailableError).isUnavailable).toBe(true)
    const bad = await failWith(401, 'nope').catch((e: unknown) => e)
    expect((bad as ProviderAuthError).isUnavailable).toBe(false)
  })
})

describe('local servers', () => {
  it('serve the OpenAI API under /v1 unless the address already has it', () => {
    expect(apiBaseOf('ollama', 'http://localhost:11434')).toBe('http://localhost:11434/v1')
    expect(apiBaseOf('lmstudio', 'http://localhost:1234/v1/')).toBe('http://localhost:1234/v1')
    expect(apiBaseOf('openai_compatible', 'https://proxy.acme.test/llm')).toBe(
      'https://proxy.acme.test/llm',
    )
  })

  it('answer a generateText call through the AI SDK, with the server key when one is set', async () => {
    const fetchFn = vi.fn<Fetch>(() =>
      Promise.resolve(
        json({
          id: 'chatcmpl-1',
          object: 'chat.completion',
          created: 1,
          model: 'llama3.1:8b',
          choices: [
            {
              index: 0,
              message: { role: 'assistant', content: 'Hello from Ollama' },
              finish_reason: 'stop',
            },
          ],
          usage: { prompt_tokens: 5, completion_tokens: 4, total_tokens: 9 },
        }),
      ),
    )
    const ollama = createAiProviders({ fetch: fetchFn }).get('ollama')
    const model = ollama?.createLanguageModel(
      { baseUrl: 'http://localhost:11434', apiKey: 'local-key' },
      'llama3.1:8b',
    )
    if (!model) throw new Error('ollama is registered')
    const result = await generateText({ model, prompt: 'Hi' })
    expect(result.text).toBe('Hello from Ollama')
    expect(result.usage.inputTokens).toBe(5)
    const [url, init] = fetchFn.mock.calls[0] ?? []
    expect(url instanceof Request ? url.url : url?.toString()).toBe(
      'http://localhost:11434/v1/chat/completions',
    )
    expect(new Headers(init?.headers).get('authorization')).toBe('Bearer local-key')
  })

  it('mark only the servers on the customer hardware as local', () => {
    const providers = createAiProviders()
    expect(providers.get('ollama')?.capabilities.local).toBe(true)
    expect(providers.get('openai_compatible')?.capabilities.local).toBe(false)
    expect(providers.get('openai')?.capabilities.local).toBe(false)
  })
})
