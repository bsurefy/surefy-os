// SPDX-License-Identifier: AGPL-3.0-only
import { SCENARIO_COOKIE, SCENARIO_HEADER, SCENARIO_QUERY_PARAM, SCENARIOS } from './mock.constants'
import { getMockSettings } from './mockSettings'

import type { Scenario } from './mock.constants'

export function isScenario(value: string): value is Scenario {
  return (SCENARIOS as readonly string[]).includes(value)
}

/** The `name=value` pairs of a `Cookie` header; a malformed pair is skipped. */
export function parseCookieHeader(header: string | null): Record<string, string> {
  const cookies: Record<string, string> = {}
  if (header === null) return cookies
  for (const pair of header.split(';')) {
    const separator = pair.indexOf('=')
    if (separator === -1) continue
    const name = pair.slice(0, separator).trim()
    if (name === '') continue
    try {
      cookies[name] = decodeURIComponent(pair.slice(separator + 1).trim())
    } catch {
      // not percent-encoded; the raw value is as good as it gets
      cookies[name] = pair.slice(separator + 1).trim()
    }
  }
  return cookies
}

function nonEmpty(value: string | null | undefined): string | undefined {
  const trimmed = value?.trim()
  return trimmed === undefined || trimmed === '' ? undefined : trimmed
}

/**
 * The scenario a request asks for: the `scenario` query value, then the `x-mock-scenario`
 * header, then the `scenario` cookie, then the configured default (`MOCK_SCENARIO` on the dev
 * server). The name is not checked here: a handler-specific scenario is unknown to the others.
 */
export function resolveScenario(
  request: Request,
  fallback: string = getMockSettings().defaultScenario,
): string {
  const url = new URL(request.url)
  return (
    nonEmpty(url.searchParams.get(SCENARIO_QUERY_PARAM)) ??
    nonEmpty(request.headers.get(SCENARIO_HEADER)) ??
    nonEmpty(parseCookieHeader(request.headers.get('cookie'))[SCENARIO_COOKIE]) ??
    fallback
  )
}
