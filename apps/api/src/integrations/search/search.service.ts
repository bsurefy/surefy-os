// SPDX-License-Identifier: AGPL-3.0-only
import type { SearchProviderKey, UsageEvent } from '@surefy/contracts'

import { isSearchProviderError } from './search.errors.js'
import { SEARCH_LIMIT_MAX } from './search.results.js'

import type { SearchCredentials, SearchProviders, SearchResult } from './search.types.js'
import type { Logger } from '@/core/logger/index.js'

/** The search provider an organization uses, resolved from Vault (or the install's SearXNG address). */
export interface ResolvedSearchProvider {
  providerKey: SearchProviderKey
  credentials: SearchCredentials
  /** The stored provider; null for the install's SearXNG address. */
  credentialId: string | null
  source: 'vault' | 'install'
}

export interface SearchProviderResolver {
  /** The primary, usable search provider of the organization; null when none is set up. */
  resolve(orgId: string): Promise<ResolvedSearchProvider | null>
  /** Keeps the stored provider's health current after a call (`active`, `error`, `rate_limited`). */
  recordHealth(
    orgId: string,
    credentialId: string,
    outcome: { ok: true } | { ok: false; reasonCode: string },
  ): Promise<void>
}

/** The personal-data filter for text that leaves for a search provider (always off the network). */
export interface SearchPii {
  filter(input: {
    orgId: string
    text: string
    teamIds: readonly string[]
    agentId?: string | null
    requestId?: string
    locale?: string
  }): Promise<{ text: string; masked: boolean } | { blocked: true }>
}

/** One metered search: `usage_events` kind `web_search`, model key `search/{provider}`. */
export interface SearchUsage {
  record(orgId: string, event: UsageEvent): Promise<void>
}

export interface WebSearchDeps {
  providers: SearchProviders
  resolver: SearchProviderResolver
  pii: SearchPii
  usage: SearchUsage
  logger: Logger
  now?: () => Date
}

export interface WebSearchRequest {
  orgId: string
  query: string
  /** The teams the personal-data rules apply for. */
  teamIds: readonly string[]
  agentId?: string | null
  requestId?: string
  locale?: string
  freshness?: 'day' | 'week' | 'month'
  limit?: number
  /** Who is searched for; null for calls without a person (API keys, channels). */
  caller: { userId: string | null; teamId: string | null; apiKeyId?: string | null }
  /** Deterministic per search, so a retried meter records nothing twice. */
  meter: {
    key: string
    sourceRefId?: string | null
    subject?: { type: 'agent'; id: string } | null
  }
  signal?: AbortSignal
}

export type WebSearchSkipReason = 'not_configured' | 'pii_blocked' | 'provider_error'

export type WebSearchOutcome =
  | {
      ok: true
      provider: SearchProviderKey
      /** The query as it left, after the personal-data filter. */
      query: string
      piiMasked: boolean
      results: SearchResult[]
      latencyMs: number
    }
  | {
      ok: false
      reason: WebSearchSkipReason
      provider: SearchProviderKey | null
      /** The provider's failure as a connection failure code. */
      code: string | null
    }

export const DEFAULT_SEARCH_LIMIT = 5
const QUERY_MAX = 400

/**
 * Web search as a tool (integrations.md, §6): the one place that runs a query. Business code asks
 * here after the access policy allowed web search for the person. The query passes the
 * personal-data filter first (a type set to block ends the search before anything leaves), then
 * goes to the organization's provider; the result is returned as data and metered.
 */
export class WebSearchService {
  private readonly now: () => Date

  constructor(private readonly deps: WebSearchDeps) {
    this.now = deps.now ?? (() => new Date())
  }

  /** Whether a search could run now: a provider is set up and usable. */
  async isConfigured(orgId: string): Promise<boolean> {
    return (await this.deps.resolver.resolve(orgId)) !== null
  }

  async search(request: WebSearchRequest): Promise<WebSearchOutcome> {
    const resolved = await this.deps.resolver.resolve(request.orgId)
    const definition = resolved === null ? undefined : this.deps.providers.get(resolved.providerKey)
    if (resolved === null || definition === undefined) {
      return { ok: false, reason: 'not_configured', provider: null, code: null }
    }
    const provider = resolved.providerKey

    let filtered: Awaited<ReturnType<SearchPii['filter']>>
    try {
      filtered = await this.deps.pii.filter({
        orgId: request.orgId,
        text: request.query.trim().slice(0, QUERY_MAX),
        teamIds: request.teamIds,
        ...(request.agentId === undefined ? {} : { agentId: request.agentId }),
        ...(request.requestId === undefined ? {} : { requestId: request.requestId }),
        ...(request.locale === undefined ? {} : { locale: request.locale }),
      })
    } catch (error) {
      // text that cannot be checked does not leave
      this.deps.logger.warn({ err: error, orgId: request.orgId }, 'search query not checked')
      return { ok: false, reason: 'provider_error', provider, code: null }
    }
    if ('blocked' in filtered) return { ok: false, reason: 'pii_blocked', provider, code: null }
    if (filtered.text === '') return { ok: false, reason: 'provider_error', provider, code: null }

    const startedAt = this.now()
    const started = performance.now()
    const limit = Math.min(Math.max(request.limit ?? DEFAULT_SEARCH_LIMIT, 1), SEARCH_LIMIT_MAX)
    try {
      const results = await definition.connect(resolved.credentials).search(
        {
          q: filtered.text,
          limit,
          ...(request.locale === undefined ? {} : { locale: request.locale }),
          ...(request.freshness === undefined ? {} : { freshness: request.freshness }),
        },
        request.signal,
      )
      const latencyMs = Math.round(performance.now() - started)
      await this.afterCall(request, resolved, startedAt, latencyMs, filtered.masked, null)
      return {
        ok: true,
        provider,
        query: filtered.text,
        piiMasked: filtered.masked,
        results,
        latencyMs,
      }
    } catch (error) {
      if (request.signal?.aborted === true) throw error
      if (!isSearchProviderError(error)) throw error
      const latencyMs = Math.round(performance.now() - started)
      await this.afterCall(
        request,
        resolved,
        startedAt,
        latencyMs,
        filtered.masked,
        error.reasonCode,
      )
      return { ok: false, reason: 'provider_error', provider, code: error.reasonCode }
    }
  }

  private async afterCall(
    request: WebSearchRequest,
    resolved: ResolvedSearchProvider,
    startedAt: Date,
    latencyMs: number,
    piiMasked: boolean,
    errorCode: string | null,
  ): Promise<void> {
    const subject = request.meter.subject ?? null
    const event: UsageEvent = {
      userId: request.caller.userId,
      teamId: request.caller.userId === null ? null : request.caller.teamId,
      apiKeyId: request.caller.apiKeyId ?? null,
      sourceModule: 'search',
      subjectType: subject?.type ?? null,
      subjectId: subject?.id ?? null,
      sourceRefId: request.meter.sourceRefId ?? null,
      kind: 'web_search',
      modelKey: `search/${resolved.providerKey}`,
      vaultModelId: null,
      credentialId: resolved.credentialId,
      credentialScope: 'organization',
      providerKey: resolved.providerKey,
      inputTokens: 0,
      outputTokens: 0,
      cachedInputTokens: 0,
      reasoningTokens: 0,
      units: 1,
      costMicros: 0,
      currency: 'USD',
      billedVia: 'provider_direct',
      latencyMs,
      outcome: errorCode === null ? 'success' : 'error',
      errorCode,
      routed: false,
      fallbackFromModelKey: null,
      piiMasked,
      dataLocation: resolved.providerKey === 'searxng' ? 'local' : 'provider',
      dedupeKey: `${request.meter.key}:search`,
      requestId: request.requestId ?? null,
      occurredAt: startedAt.toISOString(),
    }
    try {
      await this.deps.usage.record(request.orgId, event)
      if (resolved.credentialId !== null) {
        await this.deps.resolver.recordHealth(
          request.orgId,
          resolved.credentialId,
          errorCode === null ? { ok: true } : { ok: false, reasonCode: errorCode },
        )
      }
    } catch (error) {
      // the search itself happened; the books are repaired by the hourly reconciliation
      this.deps.logger.warn({ err: error, orgId: request.orgId }, 'search not recorded')
    }
  }
}
