// SPDX-License-Identifier: AGPL-3.0-only
import type { SearchProviderKey } from '@surefy/contracts'

/** The provider's side of a web search (integrations.md, §6); business code never calls it directly. */
export interface SearchQuery {
  q: string
  /** A language tag such as `en` or `de-DE`; providers that cannot filter by language ignore it. */
  locale?: string
  freshness?: 'day' | 'week' | 'month'
  limit: number
}

export interface SearchResult {
  title: string
  url: string
  snippet: string
  publishedAt?: string
}

export interface SearchProvider {
  search(query: SearchQuery, signal?: AbortSignal): Promise<SearchResult[]>
}

/** What a provider needs: SearXNG an address, Brave and Tavily an API key from Vault. */
export interface SearchCredentials {
  baseUrl?: string
  apiKey?: string
}

export interface SearchProviderDefinition {
  key: SearchProviderKey
  label: string
  /** What Vault asks for when this provider is added. */
  requires: 'base_url' | 'secret'
  /** The call that checks the address or key: one result for a harmless query. */
  connect(credentials: SearchCredentials): SearchProvider
}

/** The search providers by `provider_key`; a test passes its own `fetch` to fake every provider. */
export interface SearchProviders {
  get(providerKey: string): SearchProviderDefinition | undefined
  keys(): SearchProviderKey[]
}
