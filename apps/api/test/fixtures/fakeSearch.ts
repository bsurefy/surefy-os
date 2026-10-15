// SPDX-License-Identifier: AGPL-3.0-only
import {
  createSearchProviders,
  type Fetch,
  type SearchProviders,
} from '@/integrations/search/index.js'

/** How the fake answers the next searches: normally, with an HTTP failure, or not at all. */
export type FakeSearchMode =
  { kind: 'ok' } | { kind: 'status'; status: number } | { kind: 'offline' }

export interface FakeSearchCall {
  url: URL
  method: string
  headers: Headers
  body: unknown
}

export interface FakeSearch {
  providers: SearchProviders
  calls: FakeSearchCall[]
  /** Answer every later search this way; `ok` restores the normal answers. */
  setMode(mode: FakeSearchMode): void
  reset(): void
  /** The results every search answers, in the provider's own format. */
  results: { title: string; url: string; snippet: string }[]
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

const DEFAULT_RESULTS = [
  {
    title: 'SurefyOS release notes',
    url: 'https://example.com/surefyos/release',
    snippet: 'What is new in the latest SurefyOS release.',
  },
  {
    title: 'Self-hosting SurefyOS',
    url: 'https://example.com/surefyos/self-host',
    snippet: 'Install SurefyOS on your own server.',
  },
]

/**
 * Brave, Tavily and SearXNG as one fake behind `createSearchProviders({ fetch })`: tests never
 * reach a real search provider. Each answers in its own format.
 */
export function createFakeSearch(): FakeSearch {
  let mode: FakeSearchMode = { kind: 'ok' }
  const calls: FakeSearchCall[] = []
  const fake: FakeSearch = {
    providers: createSearchProviders(),
    calls,
    setMode: (next) => {
      mode = next
    },
    reset: () => {
      mode = { kind: 'ok' }
      calls.length = 0
      fake.results = [...DEFAULT_RESULTS]
    },
    results: [...DEFAULT_RESULTS],
  }
  const answer = (input: Parameters<Fetch>[0], init: Parameters<Fetch>[1]): Response => {
    const url = new URL(input instanceof Request ? input.url : input.toString())
    const text = typeof init?.body === 'string' ? init.body : undefined
    calls.push({
      url,
      method: init?.method ?? 'GET',
      headers: new Headers(init?.headers),
      body: text === undefined ? undefined : (JSON.parse(text) as unknown),
    })
    if (mode.kind === 'offline') throw new TypeError('fetch failed')
    if (mode.kind === 'status') return json({}, mode.status)
    if (url.hostname === 'api.search.brave.com') {
      return json({
        web: {
          results: fake.results.map((r) => ({
            title: r.title,
            url: r.url,
            description: r.snippet,
          })),
        },
      })
    }
    // Tavily and a SearXNG instance on any address answer alike here
    return json({
      results: fake.results.map((r) => ({ title: r.title, url: r.url, content: r.snippet })),
    })
  }
  const fetchFn: Fetch = (input, init) => {
    try {
      return Promise.resolve(answer(input, init))
    } catch (error) {
      return Promise.reject(error instanceof Error ? error : new Error(String(error)))
    }
  }
  fake.providers = createSearchProviders({ fetch: fetchFn })
  return fake
}
