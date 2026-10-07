// SPDX-License-Identifier: AGPL-3.0-only
import { createOpenAICompatible } from '@ai-sdk/openai-compatible'
import { embed } from 'ai'

import { EMBEDDING_DIMENSIONS } from '@surefy/contracts'

import { catalogEntry } from '../ai.catalog.js'
import { trimSlashes, type Fetch } from './http.js'
import { listOpenAiModels } from './openai.js'

import type { AiProviderCredentials, AiProviderDefinition, DiscoveredModel } from '../ai.types.js'

const V1 = '/v1'

/**
 * The OpenAI-compatible API path of a server: Ollama, LM Studio, vLLM and llama.cpp serve it under
 * `/v1`, so an address entered as `http://localhost:11434` works as is. A generic
 * `openai_compatible` address is used exactly as entered.
 */
export function apiBaseOf(providerKey: string, baseUrl: string): string {
  const trimmed = trimSlashes(baseUrl)
  if (providerKey === 'openai_compatible') return trimmed
  return new URL(trimmed).pathname.endsWith(V1) ? trimmed : `${trimmed}${V1}`
}

function requireBaseUrl(credentials: AiProviderCredentials): string {
  if (!credentials.baseUrl) throw new Error('a server address is required')
  return credentials.baseUrl
}

/**
 * A server that speaks the OpenAI API: a proxy or hosted gateway (`openai_compatible`, kind
 * `ai_provider`) or a server on the customer's hardware (kind `local_server`).
 */
export function openaiCompatibleProvider(
  fetchFn: Fetch,
  options: { key: string; label: string; local: boolean },
): AiProviderDefinition {
  const apiBase = (credentials: AiProviderCredentials) =>
    apiBaseOf(options.key, requireBaseUrl(credentials))
  const client = (credentials: AiProviderCredentials) =>
    createOpenAICompatible({
      name: options.key,
      baseURL: apiBase(credentials),
      ...(credentials.apiKey === undefined ? {} : { apiKey: credentials.apiKey }),
      fetch: fetchFn,
    })
  return {
    key: options.key,
    label: options.label,
    capabilities: {
      chat: true,
      embeddings: true,
      vision: false,
      tools: true,
      local: options.local,
    },
    requiresBaseUrl: true,
    requiresApiKey: false,
    createLanguageModel: (credentials, modelId) => client(credentials).languageModel(modelId),
    createEmbeddingModel: (credentials, modelId) => client(credentials).embeddingModel(modelId),
    listModels: async (credentials, signal) => {
      const models = await listOpenAiModels(
        fetchFn,
        options.key,
        apiBase(credentials),
        credentials.apiKey,
        signal,
      )
      return Promise.all(models.map((model) => withEmbeddingSize(model)))

      // A server does not list the size of its embedding models and the catalog knows none of
      // its models, so the size is read from one tiny answer; an unusable one leaves it unknown.
      async function withEmbeddingSize(model: DiscoveredModel): Promise<DiscoveredModel> {
        if (model.type !== 'embedding' || catalogEntry(options.key, model.providerModelId)) {
          return model
        }
        try {
          const { embedding } = await embed({
            model: client(credentials).embeddingModel(model.providerModelId),
            value: 'size probe',
            abortSignal: signal,
            maxRetries: 0,
          })
          const size = embedding.length
          return (EMBEDDING_DIMENSIONS as readonly number[]).includes(size)
            ? { ...model, embeddingDimensions: size }
            : model
        } catch {
          return model
        }
      }
    },
    checkedUrl: (credentials) => `${apiBase(credentials)}/models`,
  }
}
