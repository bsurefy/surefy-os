// SPDX-License-Identifier: AGPL-3.0-only
import { anthropicProvider } from './providers/anthropic.js'
import { googleProvider } from './providers/google.js'
import { openaiProvider } from './providers/openai.js'
import { openaiCompatibleProvider } from './providers/openaiCompatible.js'

import type { AiProviderDefinition } from './ai.types.js'
import type { Fetch } from './providers/http.js'

/**
 * Every AI provider and local server kind SurefyOS can call (integrations.md, §2), by the
 * `provider_key` Vault stores. Cloud providers are kind `ai_provider`; the rest are local servers,
 * plus `openai_compatible`, which is either.
 */
export function createAiProviderRegistry(
  fetchFn: Fetch,
): ReadonlyMap<string, AiProviderDefinition> {
  const local = (key: string, label: string) =>
    openaiCompatibleProvider(fetchFn, { key, label, local: true })
  const providers: AiProviderDefinition[] = [
    openaiProvider(fetchFn),
    anthropicProvider(fetchFn),
    googleProvider(fetchFn),
    openaiCompatibleProvider(fetchFn, {
      key: 'openai_compatible',
      label: 'OpenAI-compatible',
      local: false,
    }),
    local('ollama', 'Ollama'),
    local('vllm', 'vLLM'),
    local('llamacpp', 'llama.cpp'),
    local('lmstudio', 'LM Studio'),
  ]
  return new Map(providers.map((provider) => [provider.key, provider]))
}
