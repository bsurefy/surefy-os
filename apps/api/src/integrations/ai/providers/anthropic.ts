// SPDX-License-Identifier: AGPL-3.0-only
import { createAnthropic } from '@ai-sdk/anthropic'

import { catalogEntry } from '../ai.catalog.js'
import { getJson, trimSlashes, type Fetch } from './http.js'

import type { AiProviderCredentials, AiProviderDefinition } from '../ai.types.js'

const DEFAULT_BASE_URL = 'https://api.anthropic.com/v1'
const API_VERSION = '2023-06-01'
const PAGE_LIMIT = 1000

interface ModelList {
  data?: { id?: unknown; display_name?: unknown }[]
}

const baseUrlOf = (credentials: AiProviderCredentials) => credentials.baseUrl ?? DEFAULT_BASE_URL

/** Anthropic: chat models only (no embeddings). */
export function anthropicProvider(fetchFn: Fetch): AiProviderDefinition {
  const client = (credentials: AiProviderCredentials) =>
    createAnthropic({
      apiKey: credentials.apiKey ?? '',
      baseURL: baseUrlOf(credentials),
      fetch: fetchFn,
    })
  return {
    key: 'anthropic',
    label: 'Anthropic',
    capabilities: { chat: true, embeddings: false, vision: true, tools: true, local: false },
    requiresBaseUrl: false,
    requiresApiKey: true,
    createLanguageModel: (credentials, modelId) => client(credentials).languageModel(modelId),
    async listModels(credentials, signal) {
      const body = (await getJson(
        fetchFn,
        `${trimSlashes(baseUrlOf(credentials))}/models?limit=${String(PAGE_LIMIT)}`,
        { 'x-api-key': credentials.apiKey ?? '', 'anthropic-version': API_VERSION },
        signal,
      )) as ModelList
      return (body.data ?? []).flatMap(({ id, display_name: displayName }) =>
        typeof id === 'string' && id !== ''
          ? [
              {
                providerModelId: id,
                displayName:
                  catalogEntry('anthropic', id)?.displayName ??
                  (typeof displayName === 'string' ? displayName : id),
                type: 'chat' as const,
              },
            ]
          : [],
      )
    },
    checkedUrl: (credentials) => `${trimSlashes(baseUrlOf(credentials))}/models`,
  }
}
