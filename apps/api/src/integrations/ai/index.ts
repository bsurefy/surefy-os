// SPDX-License-Identifier: AGPL-3.0-only
import { createAiProviderRegistry } from './ai.registry.js'

import type { AiProviderDefinition } from './ai.types.js'
import type { Fetch } from './providers/http.js'

export { catalogEntry, guessModelType, MODEL_CATALOG, type CatalogEntry } from './ai.catalog.js'
export {
  AiProviderError,
  ProviderAuthError,
  providerErrorFrom,
  providerErrorFromHttp,
  ProviderRateLimitError,
  ProviderRegionError,
  ProviderTimeoutError,
  ProviderUnavailableError,
} from './ai.errors.js'
export type {
  AiProviderCapabilities,
  AiProviderCredentials,
  AiProviderDefinition,
  DiscoveredModel,
} from './ai.types.js'
export { apiBaseOf } from './providers/openaiCompatible.js'
export { isAiProviderError, type Fetch } from './providers/http.js'

/** The AI providers by `provider_key`; a test passes its own `fetch` to fake every provider. */
export interface AiProviders {
  get(providerKey: string): AiProviderDefinition | undefined
  keys(): string[]
}

export function createAiProviders(options: { fetch?: Fetch } = {}): AiProviders {
  const registry = createAiProviderRegistry(options.fetch ?? globalThis.fetch)
  return {
    get: (providerKey) => registry.get(providerKey),
    keys: () => [...registry.keys()],
  }
}
