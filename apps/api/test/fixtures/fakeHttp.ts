// SPDX-License-Identifier: AGPL-3.0-only
import {
  OutboundError,
  type HttpRequest,
  type HttpResult,
  type OutboundHttp,
} from '@/modules/connections/connectionsHttp.js'

/** One call the app made to another app. */
export interface FakeHttpCall {
  kind: 'provider' | 'external'
  url: string
  request: HttpRequest
}

/** What a rule answers: a status and body, or a network failure. */
export type FakeHttpAnswer =
  | { status?: number; body?: unknown; text?: string; headers?: Record<string, string> }
  | OutboundError

export type FakeHttpRule = FakeHttpAnswer | ((call: FakeHttpCall) => FakeHttpAnswer)

export interface FakeHttp extends OutboundHttp {
  calls: FakeHttpCall[]
  /** Answer calls whose URL contains (or matches) `match`; a later rule wins over an earlier one. */
  on(match: string | RegExp, rule: FakeHttpRule): void
  /** The calls whose URL contains `match`. */
  callsTo(match: string): FakeHttpCall[]
  /** Forget the rules and the calls: every call is unreachable until a rule answers it. */
  reset(): void
}

const matches = (match: string | RegExp, url: string): boolean =>
  typeof match === 'string' ? url.includes(match) : match.test(url)

/**
 * The other apps, scripted (testing.md, §3): no test reaches a provider, a custom API or an OAuth
 * server. A call no rule answers fails as "nothing answered".
 */
export function createFakeHttp(): FakeHttp {
  const calls: FakeHttpCall[] = []
  const rules: { match: string | RegExp; rule: FakeHttpRule }[] = []

  const answer = (kind: FakeHttpCall['kind'], url: string, request: HttpRequest): HttpResult => {
    const call: FakeHttpCall = { kind, url, request }
    calls.push(call)
    const found = [...rules].reverse().find((entry) => matches(entry.match, url))
    if (found === undefined) throw new OutboundError('unreachable', `no fake answer for ${url}`)
    const reply = typeof found.rule === 'function' ? found.rule(call) : found.rule
    if (reply instanceof OutboundError) throw reply
    return {
      status: reply.status ?? 200,
      headers: reply.headers ?? { 'content-type': 'application/json' },
      text: reply.text ?? JSON.stringify(reply.body ?? {}),
      latencyMs: 12,
    }
  }

  return {
    calls,
    provider: (url, request) => Promise.resolve().then(() => answer('provider', url, request)),
    external: (url, request) => Promise.resolve().then(() => answer('external', url, request)),
    on: (match, rule) => {
      rules.push({ match, rule })
    },
    callsTo: (match) => calls.filter((call) => call.url.includes(match)),
    reset: () => {
      calls.length = 0
      rules.length = 0
    },
  }
}

/** The form fields of a request body, for rules that depend on `grant_type` or `code`. */
export const formOf = (call: FakeHttpCall): URLSearchParams =>
  new URLSearchParams(call.request.body ?? '')
