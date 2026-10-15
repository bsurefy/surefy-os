// SPDX-License-Identifier: AGPL-3.0-only
export {
  isSearchProviderError,
  SearchAuthError,
  SearchProviderError,
  SearchRateLimitError,
  SearchTimeoutError,
  SearchUnavailableError,
} from './search.errors.js'
export { createSearchProviders } from './search.registry.js'
export { RESULT_SNIPPET_MAX, resultsForModel, SEARCH_LIMIT_MAX } from './search.results.js'
export {
  DEFAULT_SEARCH_LIMIT,
  WebSearchService,
  type ResolvedSearchProvider,
  type SearchPii,
  type SearchProviderResolver,
  type SearchUsage,
  type WebSearchDeps,
  type WebSearchOutcome,
  type WebSearchRequest,
  type WebSearchSkipReason,
} from './search.service.js'
export type {
  SearchCredentials,
  SearchProvider,
  SearchProviderDefinition,
  SearchProviders,
  SearchQuery,
  SearchResult,
} from './search.types.js'
export type { Fetch } from './providers/http.js'
