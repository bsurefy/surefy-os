// SPDX-License-Identifier: AGPL-3.0-only
import { createHash, randomBytes } from 'node:crypto'

import { OAUTH_STATE_TTL_MINUTES } from '@surefy/contracts'
import type { ConnectionScope } from '@surefy/contracts'

import { OAUTH_STATE_BYTES, OAUTH_STATE_KEY_PREFIX } from './connections.constants.js'

import type { CacheClient } from '@/core/cache/index.js'

/** Everything `oauth/complete` needs to finish a sign-in that `oauth/start` began. */
export interface OauthSession {
  orgId: string
  userId: string
  providerKey: string
  name?: string
  scope: ConnectionScope
  teamId?: string
  baseUrl?: string
  extra?: Record<string, string>
  reconnectConnectionId?: string
  returnTo?: string
  scopes: string[]
  redirectUri: string
  /** The PKCE verifier; the app only sees its hash. */
  codeVerifier: string
}

/** A PKCE pair (RFC 7636, S256). */
export function newPkce(): { verifier: string; challenge: string } {
  const verifier = randomBytes(OAUTH_STATE_BYTES).toString('base64url')
  return { verifier, challenge: createHash('sha256').update(verifier).digest('base64url') }
}

/**
 * Started sign-ins, in Redis for ten minutes and used once (`GETDEL`). A Redis failure fails the
 * request: unlike a cache, losing the state would only fail the sign-in later and more confusingly.
 */
export class OauthStateStore {
  constructor(private readonly client: Pick<CacheClient, 'set' | 'getdel'>) {}

  async create(session: OauthSession): Promise<{ state: string; expiresAt: Date }> {
    const state = randomBytes(OAUTH_STATE_BYTES).toString('base64url')
    const ttlSeconds = OAUTH_STATE_TTL_MINUTES * 60
    await this.client.set(
      `${OAUTH_STATE_KEY_PREFIX}${state}`,
      JSON.stringify(session),
      'EX',
      ttlSeconds,
    )
    return { state, expiresAt: new Date(Date.now() + ttlSeconds * 1000) }
  }

  /** Null for a state that is unknown, expired or already used. */
  async take(state: string): Promise<OauthSession | null> {
    const raw = await this.client.getdel(`${OAUTH_STATE_KEY_PREFIX}${state}`)
    if (raw === null) return null
    try {
      return JSON.parse(raw) as OauthSession
    } catch {
      return null
    }
  }
}
