// SPDX-License-Identifier: AGPL-3.0-only
import { toResults } from '../search.results.js'
import { arrayOf, isRecord, requestJson, type Fetch } from './http.js'

import type { SearchProviderDefinition } from '../search.types.js'

const ENDPOINT = 'https://api.search.brave.com/res/v1/web/search'
const FRESHNESS = { day: 'pd', week: 'pw', month: 'pm' } as const

/** Brave Search API: `GET /res/v1/web/search` with the key in `X-Subscription-Token`. */
export function braveProvider(fetchFn: Fetch): SearchProviderDefinition {
  return {
    key: 'brave',
    label: 'Brave Search',
    requires: 'secret',
    connect: (credentials) => ({
      async search(query, signal) {
        const url = new URL(ENDPOINT)
        url.searchParams.set('q', query.q)
        url.searchParams.set('count', String(query.limit))
        url.searchParams.set('text_decorations', 'false')
        if (query.freshness !== undefined)
          url.searchParams.set('freshness', FRESHNESS[query.freshness])
        const language = query.locale?.split('-')[0]
        if (language !== undefined && language !== '') url.searchParams.set('search_lang', language)
        const body = await requestJson(
          fetchFn,
          url.href,
          {
            method: 'GET',
            headers: {
              accept: 'application/json',
              'x-subscription-token': credentials.apiKey ?? '',
            },
          },
          signal,
        )
        const web = isRecord(body) && isRecord(body.web) ? body.web : {}
        return toResults(
          arrayOf(web.results).flatMap((item) =>
            isRecord(item)
              ? [
                  {
                    title: item.title,
                    url: item.url,
                    snippet: item.description,
                    publishedAt: item.page_age,
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
