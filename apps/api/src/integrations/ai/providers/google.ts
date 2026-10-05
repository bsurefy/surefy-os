// SPDX-License-Identifier: AGPL-3.0-only
import { createGoogleGenerativeAI } from '@ai-sdk/google'

import { catalogEntry } from '../ai.catalog.js'
import { getJson, trimSlashes, type Fetch } from './http.js'

import type { AiProviderCredentials, AiProviderDefinition, DiscoveredModel } from '../ai.types.js'

const DEFAULT_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta'
const PAGE_SIZE = 1000
const MODEL_PREFIX = 'models/'

interface ModelList {
  models?: { name?: unknown; displayName?: unknown; supportedGenerationMethods?: unknown }[]
}

const baseUrlOf = (credentials: AiProviderCredentials) => credentials.baseUrl ?? DEFAULT_BASE_URL

function toDiscovered(model: NonNullable<ModelList['models']>[number]): DiscoveredModel[] {
  if (typeof model.name !== 'string') return []
  const id = model.name.startsWith(MODEL_PREFIX)
    ? model.name.slice(MODEL_PREFIX.length)
    : model.name
  const methods = Array.isArray(model.supportedGenerationMethods)
    ? model.supportedGenerationMethods
    : []
  const isEmbedding = methods.includes('embedContent')
  if (!isEmbedding && !methods.includes('generateContent')) return []
  return [
    {
      providerModelId: id,
      displayName:
        catalogEntry('google', id)?.displayName ??
        (typeof model.displayName === 'string' ? model.displayName : id),
      type: isEmbedding ? 'embedding' : 'chat',
    },
  ]
}

/** Google Gemini API (AI Studio keys). */
export function googleProvider(fetchFn: Fetch): AiProviderDefinition {
  const client = (credentials: AiProviderCredentials) =>
    createGoogleGenerativeAI({
      apiKey: credentials.apiKey ?? '',
      baseURL: baseUrlOf(credentials),
      fetch: fetchFn,
    })
  return {
    key: 'google',
    label: 'Google',
    capabilities: { chat: true, embeddings: true, vision: true, tools: true, local: false },
    requiresBaseUrl: false,
    requiresApiKey: true,
    createLanguageModel: (credentials, modelId) => client(credentials).languageModel(modelId),
    createEmbeddingModel: (credentials, modelId) => client(credentials).embeddingModel(modelId),
    async listModels(credentials, signal) {
      const body = (await getJson(
        fetchFn,
        `${trimSlashes(baseUrlOf(credentials))}/models?pageSize=${String(PAGE_SIZE)}`,
        { 'x-goog-api-key': credentials.apiKey ?? '' },
        signal,
      )) as ModelList
      return (body.models ?? []).flatMap(toDiscovered)
    },
    checkedUrl: (credentials) => `${trimSlashes(baseUrlOf(credentials))}/models`,
  }
}
