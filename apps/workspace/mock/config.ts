// SPDX-License-Identifier: AGPL-3.0-only
import { parseMockDomains } from '@surefy/web-core/testing/mock'

const DEFAULT_API_PORT = 4000

export interface MockServerConfig {
  /** The mock server listens where the app expects the API (`API_PORT`). */
  port: number
  /** The real API that unmocked requests go to: sign-in, setup and passthrough domains. */
  upstreamUrl: string
  /** `MOCK_DOMAINS=chat,knowledge`; undefined mocks every registered domain. */
  domains: string[] | undefined
  /** `MOCK_SCENARIO`: the scenario when a request names none. */
  defaultScenario: string | undefined
}

function nonBlank(value: string | undefined): string | undefined {
  const trimmed = value?.trim()
  return trimmed === undefined || trimmed === '' ? undefined : trimmed
}

function port(value: string | undefined, name: string, fallback: number): number {
  if (value === undefined || value.trim() === '') return fallback
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65_535) {
    throw new Error(`${name} must be a port number, got "${value}"`)
  }
  return parsed
}

/**
 * The mock server's settings from the environment. The real API runs next to it on
 * `MOCK_UPSTREAM_URL`, by default the port after `API_PORT`.
 */
export function readMockServerConfig(
  env: Readonly<Record<string, string | undefined>> = process.env,
): MockServerConfig {
  const apiPort = port(env.API_PORT, 'API_PORT', DEFAULT_API_PORT)
  const upstreamUrl = nonBlank(env.MOCK_UPSTREAM_URL) ?? `http://localhost:${apiPort + 1}`
  return {
    port: apiPort,
    upstreamUrl: new URL(upstreamUrl).origin,
    domains: parseMockDomains(env.MOCK_DOMAINS),
    defaultScenario: nonBlank(env.MOCK_SCENARIO),
  }
}
