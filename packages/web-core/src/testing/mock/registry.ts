// SPDX-License-Identifier: AGPL-3.0-only
import type { MockDomain, MockDomainOptions } from './mock.types'
import type { HttpHandler } from 'msw'

/** The handlers of one API domain, as `mock/handlers/<domain>.ts` exports them. */
export function defineMockDomain(
  name: string,
  handlers: HttpHandler[],
  { isLive = false }: MockDomainOptions = {},
): MockDomain {
  if (name.trim() === '') throw new Error('A mock domain needs a name')
  return { name, handlers, isLive }
}

/**
 * `MOCK_DOMAINS=chat,knowledge` as a list; `undefined` when the variable is unset or blank, which
 * means every registered domain that is not live is mocked.
 */
export function parseMockDomains(value: string | undefined): string[] | undefined {
  if (value === undefined) return undefined
  const names = value
    .split(',')
    .map((name) => name.trim())
    .filter((name) => name !== '')
  return names.length === 0 ? undefined : [...new Set(names)]
}

export interface MockDomainSelection {
  /** The domains the mock server answers. */
  mocked: MockDomain[]
  /** The registered domains that are forwarded to the real API instead. */
  passthrough: string[]
}

/**
 * Which registered domains are mocked: every domain not yet live, or exactly the ones named in
 * `MOCK_DOMAINS` (a live domain too, to look at its states). A duplicate or unknown name is a
 * configuration mistake and throws.
 */
export function selectMockDomains(
  domains: readonly MockDomain[],
  only?: readonly string[],
): MockDomainSelection {
  const names = domains.map((domain) => domain.name)
  const duplicate = names.find((name, index) => names.indexOf(name) !== index)
  if (duplicate !== undefined) throw new Error(`Mock domain "${duplicate}" is registered twice`)

  if (only === undefined) {
    return {
      mocked: domains.filter((domain) => !domain.isLive),
      passthrough: domains.filter((domain) => domain.isLive).map((domain) => domain.name),
    }
  }

  const unknown = only.filter((name) => !names.includes(name))
  if (unknown.length > 0) {
    const quoted = unknown.map((name) => JSON.stringify(name)).join(', ')
    throw new Error(
      `Unknown mock domain${unknown.length > 1 ? 's' : ''} ${quoted}. Registered: ${names.join(', ')}`,
    )
  }
  return {
    mocked: domains.filter((domain) => only.includes(domain.name)),
    passthrough: names.filter((name) => !only.includes(name)),
  }
}
