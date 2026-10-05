// SPDX-License-Identifier: AGPL-3.0-only
import { createOpenAI } from '@ai-sdk/openai'

import { catalogEntry, guessModelType } from '../ai.catalog.js'
import { getJson, trimSlashes, type Fetch } from './http.js'

import type { AiProviderCredentials, AiProviderDefinition, DiscoveredModel } from '../ai.types.js'

const DEFAULT_BASE_URL = 'https://api.openai.com/v1'

interface ModelList {
  data?: { id?: unknown }[]
}

/** `GET /models` of the OpenAI API and every server that speaks it. */
export async function listOpenAiModels(
  fetchFn: Fetch,
  providerKey: string,
  baseUrl: string,
  apiKey: string | undefined,
  signal: AbortSignal,
): Promise<DiscoveredModel[]> {
  const headers: Record<string, string> = apiKey ? { authorization: `Bearer ${apiKey}` } : {}
  const body = (await getJson(
    fetchFn,
    `${trimSlashes(baseUrl)}/models`,
    headers,
    signal,
  )) as ModelList
  return (body.data ?? []).flatMap(({ id }) =>
    typeof id === 'string' && id !== ''
      ? [
          {
            providerModelId: id,
            displayName: catalogEntry(providerKey, id)?.displayName ?? id,
            type: guessModelType(providerKey, id),
          },
        ]
      : [],
  )
}

const baseUrlOf = (credentials: AiProviderCredentials) => credentials.baseUrl ?? DEFAULT_BASE_URL

export function openaiProvider(fetchFn: Fetch): AiProviderDefinition {
  // never the OPENAI_API_KEY variable: the key always comes from Vault
  const client = (credentials: AiProviderCredentials) =>
    createOpenAI({
      apiKey: credentials.apiKey ?? '',
      baseURL: baseUrlOf(credentials),
      fetch: fetchFn,
    })
  return {
    key: 'openai',
    label: 'OpenAI',
    capabilities: { chat: true, embeddings: true, vision: true, tools: true, local: false },
    requiresBaseUrl: false,
    requiresApiKey: true,
    createLanguageModel: (credentials, modelId) => client(credentials).languageModel(modelId),
    createEmbeddingModel: (credentials, modelId) => client(credentials).embeddingModel(modelId),
    listModels: (credentials, signal) =>
      listOpenAiModels(fetchFn, 'openai', baseUrlOf(credentials), credentials.apiKey, signal),
    checkedUrl: (credentials) => `${trimSlashes(baseUrlOf(credentials))}/models`,
  }
}
