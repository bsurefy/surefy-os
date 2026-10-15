// SPDX-License-Identifier: AGPL-3.0-only
import { SearchUnavailableError, type SearchProviderError } from '../search.errors.js'
import { toResults } from '../search.results.js'
import { arrayOf, errorFromStatus, isRecord, requestJson, trimSlashes, type Fetch } from './http.js'

import type { SearchProviderDefinition } from '../search.types.js'

const HTTP_FORBIDDEN = 403

/** A 403 from SearXNG means its JSON output is switched off, which no key can fix. */
const searxngStatus = (status: number): SearchProviderError =>
  status === HTTP_FORBIDDEN
    ? new SearchUnavailableError('the instance does not allow the JSON format')
    : errorFromStatus(status)

/**
 * SearXNG: `GET {baseUrl}/search?format=json`. The instance is the customer's own (the optional
 * service of the self-host compose or a server they run), so its address may be private.
 */
export function searxngProvider(fetchFn: Fetch): SearchProviderDefinition {
  return {
    key: 'searxng',
    label: 'SearXNG',
    requires: 'base_url',
    connect: (credentials) => ({
      async search(query, signal) {
        if (credentials.baseUrl === undefined) throw new SearchUnavailableError('no address set')
        const url = new URL(`${trimSlashes(credentials.baseUrl)}/search`)
        url.searchParams.set('q', query.q)
        url.searchParams.set('format', 'json')
        if (query.freshness !== undefined) url.searchParams.set('time_range', query.freshness)
        if (query.locale !== undefined) url.searchParams.set('language', query.locale)
        const body = await requestJson(
          fetchFn,
          url.href,
          { method: 'GET', headers: { accept: 'application/json' } },
          signal,
          searxngStatus,
        )
        return toResults(
          arrayOf(isRecord(body) ? body.results : undefined).flatMap((item) =>
            isRecord(item)
              ? [
                  {
                    title: item.title,
                    url: item.url,
                    snippet: item.content,
                    publishedAt: item.publishedDate,
                  },
                ]
              : [],
          ),
          query.limit,
        )
      },
    }),
  }
}
