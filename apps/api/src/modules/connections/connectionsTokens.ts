// SPDX-License-Identifier: AGPL-3.0-only
import { CONNECTIONS_ERROR_CODES } from '@surefy/contracts'
import type { ConnectionSecret, ConnectionStatusReasonCode } from '@surefy/contracts'

import { DEFAULT_TOKEN_LIFETIME_SECONDS } from './connections.constants.js'
import { TokenRequestError, requestClientCredentialsToken } from './providers/index.js'

import type { ConnectionRow, ConnectionsRepository } from './connections.repository.js'
import type { ConnectionSecrets } from './connections.secrets.js'
import type { ConnectionHealth } from './connectionsHealth.js'
import type { OutboundHttp } from './connectionsHttp.js'
import type { OauthApp, OauthTokens, ProviderAdapter } from './providers/index.js'
import type { CacheClient } from '@/core/cache/index.js'
import type { Database } from '@/core/database/index.js'
import type { AuditContext } from '@/modules/audit/index.js'

export type RefreshResult = 'refreshed' | 'expired' | 'unchanged'

export interface ConnectionTokensDeps {
  db: Database
  repository: ConnectionsRepository
  secrets: ConnectionSecrets
  health: ConnectionHealth
  adapters: ReadonlyMap<string, ProviderAdapter>
  oauthApps: Readonly<Record<string, OauthApp | undefined>>
  http: OutboundHttp
  client: Pick<CacheClient, 'set' | 'del'>
  now?: () => Date
}

/** A refresh in flight lives at most this long in Redis, so a crashed worker frees the lock. */
const LOCK_SECONDS = 60
const LOCK_PREFIX = 'connections:refresh:'

/** Whether the stored secret is a client-credentials sign-in (it keeps its own client). */
export const hasClientCredentials = (secret: ConnectionSecret): boolean =>
  secret.extra?.tokenUrl !== undefined &&
  secret.extra.clientId !== undefined &&
  secret.extra.clientSecret !== undefined

/**
 * Renews the access token of an OAuth 2 connection: with the refresh token for an authorization
 * code sign-in, with the stored client for client credentials. The app is called outside any
 * transaction; the new tokens are stored re-encrypted with the organization's active key. One
 * refresh per connection runs at a time.
 */
export class ConnectionTokens {
  private readonly now: () => Date

  constructor(private readonly deps: ConnectionTokensDeps) {
    this.now = deps.now ?? (() => new Date())
  }

  async refresh(orgId: string, connectionId: string, ctx: AuditContext): Promise<RefreshResult> {
    const lockKey = `${LOCK_PREFIX}${connectionId}`
    const locked = await this.deps.client.set(lockKey, '1', 'EX', LOCK_SECONDS, 'NX')
    if (locked === null) return 'unchanged' // another process is refreshing it
    try {
      return await this.refreshLocked(orgId, connectionId, ctx)
    } finally {
      await this.deps.client.del(lockKey)
    }
  }

  private async refreshLocked(
    orgId: string,
    connectionId: string,
    ctx: AuditContext,
  ): Promise<RefreshResult> {
    const loaded = await this.deps.db.tenant(orgId, async (tx) => {
      const row = await this.deps.repository.findById(tx, orgId, connectionId)
      if (row === undefined || row.status === 'revoked' || row.authType !== 'oauth2') return null
      const secret = await this.deps.secrets.open(tx, { id: row.id, organizationId: orgId }, row)
      return secret === null ? null : { row, secret }
    })
    if (loaded === null) return 'unchanged'
    const { row, secret } = loaded

    let tokens: OauthTokens | null
    try {
      tokens = await this.requestTokens(row, secret)
    } catch (error) {
      if (!(error instanceof TokenRequestError)) throw error
      // the app is not answering: the connection keeps working until the token really expires
      let reason: ConnectionStatusReasonCode | null =
        CONNECTIONS_ERROR_CODES.CONNECTION_REFRESH_FAILED
      if (error.kind === 'unreachable') {
        reason = this.isPastExpiry(row) ? CONNECTIONS_ERROR_CODES.CONNECTION_TOKEN_EXPIRED : null
      }
      return reason === null ? 'unchanged' : this.expire(orgId, connectionId, ctx, reason)
    }
    if (tokens === null) {
      // no way to renew it: it expires when its time comes
      return this.isPastExpiry(row)
        ? this.expire(orgId, connectionId, ctx, CONNECTIONS_ERROR_CODES.CONNECTION_TOKEN_EXPIRED)
        : 'unchanged'
    }
    return this.store(orgId, row, secret, tokens)
  }

  private isPastExpiry(row: ConnectionRow): boolean {
    return row.tokenExpiresAt !== null && row.tokenExpiresAt.getTime() <= this.now().getTime()
  }

  /** Null when the connection has no way to renew its token. */
  private async requestTokens(
    row: ConnectionRow,
    secret: ConnectionSecret,
  ): Promise<OauthTokens | null> {
    if (hasClientCredentials(secret)) {
      return requestClientCredentialsToken(this.deps.http, {
        tokenUrl: secret.extra?.tokenUrl ?? '',
        clientId: secret.extra?.clientId ?? '',
        clientSecret: secret.extra?.clientSecret ?? '',
        scopes: row.oauthScopes ?? [],
      })
    }
    const flow = this.deps.adapters.get(row.providerKey)?.authorizationCode
    const app = this.deps.oauthApps[row.providerKey]
    if (flow?.refresh === undefined || app === undefined || secret.refreshToken === undefined) {
      return null
    }
    return flow.refresh(this.deps.http, { app, refreshToken: secret.refreshToken })
  }

  private async store(
    orgId: string,
    row: ConnectionRow,
    secret: ConnectionSecret,
    tokens: OauthTokens,
  ): Promise<RefreshResult> {
    const now = this.now()
    const lifetime = tokens.expiresInSeconds ?? DEFAULT_TOKEN_LIFETIME_SECONDS
    const next: ConnectionSecret = {
      ...secret,
      accessToken: tokens.accessToken,
      ...((tokens.refreshToken ?? secret.refreshToken) === undefined
        ? {}
        : { refreshToken: tokens.refreshToken ?? secret.refreshToken }),
    }
    return this.deps.db.tenant(orgId, async (tx) => {
      const current = await this.deps.repository.lockById(tx, orgId, row.id)
      // a reconnect or a disconnect that happened meanwhile wins
      if (
        current === undefined ||
        current.status === 'revoked' ||
        current.updatedAt > row.updatedAt
      ) {
        return 'unchanged'
      }
      const updated = await this.deps.repository.replaceSecret(tx, orgId, row.id, {
        sealed: await this.deps.secrets.seal(tx, { id: row.id, organizationId: orgId }, next),
        oauthScopes: tokens.scopes.length > 0 ? tokens.scopes : row.oauthScopes,
        tokenExpiresAt: new Date(now.getTime() + lifetime * 1000),
        lastRefreshedAt: now,
      })
      return updated === undefined ? 'unchanged' : 'refreshed'
    })
  }

  private async expire(
    orgId: string,
    connectionId: string,
    ctx: AuditContext,
    reason: ConnectionStatusReasonCode,
  ): Promise<RefreshResult> {
    return this.deps.db.tenant(orgId, async (tx) => {
      const current = await this.deps.repository.lockById(tx, orgId, connectionId)
      if (current === undefined || current.status === 'revoked') return 'unchanged'
      const updated = await this.deps.health.expire(tx, ctx, current, reason)
      return updated.status === 'expired' ? 'expired' : 'unchanged'
    })
  }
}
