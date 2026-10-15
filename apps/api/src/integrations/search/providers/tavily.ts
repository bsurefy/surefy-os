// SPDX-License-Identifier: AGPL-3.0-only
import { toResults } from '../search.results.js'
import { arrayOf, isRecord, requestJson, type Fetch } from './http.js'

import type { SearchProviderDefinition } from '../search.types.js'

const ENDPOINT = 'https://api.tavily.com/search'

/** Tavily: `POST /search` with the key as a bearer token. */
export function tavilyProvider(fetchFn: Fetch): SearchProviderDefinition {
  return {
    key: 'tavily',
    label: 'Tavily',
    requires: 'secret',
    connect: (credentials) => ({
      async search(query, signal) {
        const body = await requestJson(
          fetchFn,
          ENDPOINT,
          {
            method: 'POST',
            headers: {
              accept: 'application/json',
              'content-type': 'application/json',
              authorization: `Bearer ${credentials.apiKey ?? ''}`,
            },
            body: JSON.stringify({
              query: query.q,
              max_results: query.limit,
              search_depth: 'basic',
              include_answer: false,
              include_raw_content: false,
              include_images: false,
              ...(query.freshness === undefined ? {} : { time_range: query.freshness }),
            }),
          },
          signal,
        )
        return toResults(
          arrayOf(isRecord(body) ? body.results : undefined).flatMap((item) =>
            isRecord(item)
              ? [
                  {
                    title: item.title,
                    url: item.url,
                    snippet: item.content,
                    publishedAt: item.published_date,
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
