// SPDX-License-Identifier: AGPL-3.0-only
import { isApiKeyScopeAllowed } from '@surefy/contracts'
import type { ApiKeyDto, ApiKeyImpactDto, Permission } from '@surefy/contracts'

import {
  API_KEY_CHIPS_SHOWN,
  API_KEY_EXAMPLE_AGENT,
  API_KEY_EXPIRY_DAYS,
  API_KEY_SCOPE_CHOICES,
} from './ApiKeysSettings.constants'

import type { ApiKeyExpiryChoice } from './ApiKeysSettings.constants'

const MS_PER_DAY = 86_400_000
const CLOUD_APP_HOST_PREFIX = 'app.'
const CLOUD_API_HOST_PREFIX = 'api.'

/** What the Status column says: a key past its date is still `active` until someone revokes it. */
export type ApiKeyRowStatus = 'active' | 'expired' | 'revoked'

export function getApiKeyRowStatus(key: Pick<ApiKeyDto, 'status' | 'isExpired'>): ApiKeyRowStatus {
  if (key.status === 'revoked') return 'revoked'
  return key.isExpired ? 'expired' : 'active'
}

/** The sort the table shows: `-name` is name descending. */
export function toSortParam(sort: string): { id: string; desc: boolean } {
  return sort.startsWith('-') ? { id: sort.slice(1), desc: true } : { id: sort, desc: false }
}

/** The first permission as a chip, and how many more the "+N" stands for. */
export function splitScopes(scopes: readonly string[]): { shown: string[]; more: number } {
  return {
    shown: scopes.slice(0, API_KEY_CHIPS_SHOWN),
    more: Math.max(0, scopes.length - API_KEY_CHIPS_SHOWN),
  }
}

/** The permissions a person can give a key: the ones keys may carry and the person holds. */
export function getAvailableScopes(held: (permission: Permission) => boolean): Permission[] {
  return API_KEY_SCOPE_CHOICES.filter((scope) => isApiKeyScopeAllowed(scope) && held(scope))
}

/** `YYYY-MM-DD` of the day after `now`, the earliest expiry a person can pick. */
export function getEarliestExpiryDate(now: Date): string {
  return new Date(now.getTime() + MS_PER_DAY).toISOString().slice(0, 10)
}

/**
 * The `expiresAt` of the create request: 30 days, 90 days or one year from `now`, the end of a
 * picked day (UTC), or none. A picked day in the past gives an expiry the service refuses.
 */
export function getExpiresAt(
  choice: ApiKeyExpiryChoice,
  date: string,
  now: Date,
): string | undefined {
  if (choice === 'never') return undefined
  if (choice === 'date') return `${date}T23:59:59.000Z`
  return new Date(now.getTime() + API_KEY_EXPIRY_DAYS[choice] * MS_PER_DAY).toISOString()
}

/**
 * Where a key is used, for the example call. On Cloud the app answers on `app.` and the public API
 * on `api.`; a self-hosted install serves both on its own address.
 */
export function getApiBaseUrl(origin: string): string {
  const url = new URL(origin)
  if (url.hostname.startsWith(CLOUD_APP_HOST_PREFIX)) {
    url.hostname = `${CLOUD_API_HOST_PREFIX}${url.hostname.slice(CLOUD_APP_HOST_PREFIX.length)}`
  }
  return url.origin
}

/** A call that runs an agent with the new key, ready to paste. */
export function buildCurlExample(baseUrl: string, orgId: string, secret: string): string {
  return [
    `curl -X POST "${baseUrl}/api/v1/orgs/${orgId}/agents/${API_KEY_EXAMPLE_AGENT}/runs" \\`,
    `  -H "Authorization: Bearer ${secret}" \\`,
    `  -H "Content-Type: application/json" \\`,
    `  -d '{"input": "Hello"}'`,
  ].join('\n')
}

export interface RevokeImpact {
  /** Agents published over the API that this key serves. */
  agentCount: number
  /** Their names, up to what the service lists. */
  agentNames: string[]
  /** Agents beyond the listed names ("and 4 more"). */
  moreAgents: number
  /** Anything else that depends on the key, by type. */
  others: { type: string; count: number }[]
}

export function getRevokeImpact(impact: ApiKeyImpactDto): RevokeImpact {
  const agentCount = impact.dependents.find((item) => item.type === 'agent')?.count ?? 0
  const agentNames = impact.listed.filter((item) => item.type === 'agent').map((item) => item.name)
  return {
    agentCount,
    agentNames,
    moreAgents: Math.max(0, agentCount - agentNames.length),
    others: impact.dependents.filter((item) => item.type !== 'agent' && item.count > 0),
  }
}
