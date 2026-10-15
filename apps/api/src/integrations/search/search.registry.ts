// SPDX-License-Identifier: AGPL-3.0-only
import { braveProvider } from './providers/brave.js'
import { searxngProvider } from './providers/searxng.js'
import { tavilyProvider } from './providers/tavily.js'

import type { Fetch } from './providers/http.js'
import type { SearchProviderDefinition, SearchProviders } from './search.types.js'

/** Every web search provider SurefyOS can call (integrations.md, §6), by the `provider_key` Vault stores. */
export function createSearchProviders(options: { fetch?: Fetch } = {}): SearchProviders {
  const fetchFn = options.fetch ?? globalThis.fetch
  const providers: SearchProviderDefinition[] = [
    searxngProvider(fetchFn),
    braveProvider(fetchFn),
    tavilyProvider(fetchFn),
  ]
  const byKey = new Map<string, SearchProviderDefinition>(
    providers.map((provider) => [provider.key, provider]),
  )
  return {
    get: (providerKey) => byKey.get(providerKey),
    keys: () => providers.map((provider) => provider.key),
  }
}
