// SPDX-License-Identifier: AGPL-3.0-only
import { decodeCursor, toPage } from '@/lib/pagination.js'
import {
  BUILT_IN_CONNECTION_PROVIDERS,
  CONNECTION_AUDIT_ACTIONS,
  CONNECTION_EXTRA_MAX_ENTRIES,
  CONNECTIONS_ERROR_CODES,
} from '@surefy/contracts'
import type {
  ConnectionAuthType,
  ConnectionCheckDto,
  ConnectionDto,
  ConnectionImpactDto,
  ConnectionKind,
  ConnectionProviderDto,
  ConnectionSecret,
  ConnectionStatus,
  ConnectionStatusReasonCode,
  CreateConnectionInput,
  ListConnectionsQuery,
  ReconnectConnectionInput,
  UpdateConnectionInput,
} from '@surefy/contracts'

import {
  canChange,
  canManage,
  canSee,
  isUsableBy,
  principalOf,
  usableBy,
} from './connections.access.js'
import { USE_REFRESH_WINDOW_MS } from './connections.constants.js'
import {
  ConnectionAuthTypeUnsupportedError,
  ConnectionBaseUrlNotAllowedError,
  ConnectionCheckFailedError,
  ConnectionForbiddenError,
  ConnectionNotFoundError,
  ConnectionRevokedError,
} from './connections.errors.js'
import { connectionSort, ownedBy } from './connections.repository.js'
import { checkFailure } from './connectionsFailures.js'
import { hasClientCredentials } from './connectionsTokens.js'
import { TokenRequestError, requestClientCredentialsToken } from './providers/index.js'

import type { ConnectionRow, ConnectionsRepository } from './connections.repository.js'
import type { ConnectionSecrets } from './connections.secrets.js'
import type {
  ConnectionPrincipal,
  ConnectionsContext,
  ConnectionDependents,
  ConnectionsOutbox,
} from './connections.types.js'
import type { ConnectionHealth } from './connectionsHealth.js'
import type { OutboundHttp } from './connectionsHttp.js'
import type { ConnectionsLastUsed } from './connectionsLastUsed.js'
import type { ConnectionPresenter } from './connectionsPresenter.js'
import type { ConnectionTargets } from './connectionsTargets.js'
import type { ConnectionTokens } from './connectionsTokens.js'
import type { ConnectionWriter } from './connectionsWriter.js'
import type { OauthApp, OauthTokens } from './providers/index.js'
import type { Database, DbExecutor } from '@/core/database/index.js'
import type { AuditRecorder } from '@/modules/audit/index.js'

export interface ConnectionsServiceDeps {
  db: Database
  repository: ConnectionsRepository
  secrets: ConnectionSecrets
  presenter: ConnectionPresenter
  targets: ConnectionTargets
  writer: ConnectionWriter
  health: ConnectionHealth
  tokens: ConnectionTokens
  lastUsed: ConnectionsLastUsed
  dependents: ConnectionDependents
  audit: AuditRecorder
  outbox: ConnectionsOutbox
  http: OutboundHttp
  oauthApps: Readonly<Record<string, OauthApp | undefined>>
  now?: () => Date
}

/** What a caller that runs a tool, a channel or a sync gets: the connection and its secret. */
export interface ConnectionUse {
  id: string
  providerKey: string
  authType: ConnectionAuthType
  baseUrl: string | null
  externalAccountId: string | null
  /** `ConnectionSecret` v1, decrypted for this call only: never cache it, never log it. */
  secret: ConnectionSecret
}

const sessionOf = (secret: ConnectionSecret | null): ConnectionSecret => secret ?? { version: 1 }

/**
 * Connections (database/bridge-and-connections.md, §1; design/workspace/connections.md). A
 * connection is stored only after its check passes; its secret is encrypted before the insert and
 * leaves this module only through `open`, for one call.
 */
export class ConnectionsService {
  private readonly now: () => Date

  constructor(private readonly deps: ConnectionsServiceDeps) {
    this.now = deps.now ?? (() => new Date())
  }

  /** Team-scoped connections a team deletion takes with it (the teams module's dialog). */
  countForTeam(tx: DbExecutor, orgId: string, teamId: string): Promise<number> {
    return this.deps.repository.countByTeam(tx, orgId, teamId)
  }

  // ── Reads ─────────────────────────────────────────────────────────────────────────────────────

  async providers(ctx: ConnectionsContext): Promise<ConnectionProviderDto[]> {
    const counts = await this.deps.db.tenant(ctx.orgId, (tx) =>
      this.deps.repository.usableCountsByProvider(tx, ctx.orgId, principalOf(ctx)),
    )
    return BUILT_IN_CONNECTION_PROVIDERS.map((provider) => {
      const flows: readonly string[] = provider.oauthFlows
      const authorizationCodeReady =
        flows.includes('authorization_code') &&
        this.deps.targets.provider(provider.key).adapter.authorizationCode !== undefined &&
        this.deps.oauthApps[provider.key] !== undefined
      return {
        providerKey: provider.key,
        kind: provider.kind,
        authTypes: [...provider.authTypes],
        oauthFlows: provider.oauthFlows.filter(
          (flow) => flow !== 'authorization_code' || authorizationCodeReady,
        ),
        requiresBaseUrl: provider.requiresBaseUrl,
        requiredExtra: [...provider.requiredExtra],
        oauthConfigured: provider.authTypes.some((type) => type === 'oauth2')
          ? provider.oauthFlows.some(
              (flow) => flow === 'client_credentials' || authorizationCodeReady,
            )
          : false,
        connectionCount: counts.get(provider.key) ?? 0,
      }
    })
  }

  async list(
    ctx: ConnectionsContext,
    query: ListConnectionsQuery,
  ): Promise<{ items: ConnectionDto[]; nextCursor: string | null }> {
    const { limit, cursor, sort: sortParam, usable, kind, ...filters } = query
    const kinds: readonly ConnectionKind[] = kind ?? []
    const builtInKeys = BUILT_IN_CONNECTION_PROVIDERS.map((provider) => provider.key)
    const sort = connectionSort(sortParam)
    // the full list is for managers; a Builder sees what they own, or what they may use
    let visibility = canManage(ctx) ? undefined : ownedBy(ctx.userId)
    if (usable === true) visibility = usableBy(principalOf(ctx))
    return this.deps.db.tenant(ctx.orgId, async (tx) => {
      const rows = await this.deps.repository.listPage(tx, ctx.orgId, {
        limit,
        sort,
        visibility,
        builtInKeys,
        ...(filters.q === undefined ? {} : { q: filters.q }),
        ...(filters.providerKey === undefined ? {} : { providerKeys: filters.providerKey }),
        ...(kinds.length === 0
          ? {}
          : {
              kindProviderKeys: BUILT_IN_CONNECTION_PROVIDERS.filter((provider) =>
                kinds.includes(provider.kind),
              ).map((provider) => provider.key),
              includeBridges: kinds.includes('bridge'),
            }),
        ...(filters.scope === undefined ? {} : { scopes: filters.scope }),
        ...(filters.status === undefined ? {} : { statuses: filters.status }),
        ...(filters.teamId === undefined ? {} : { teamId: filters.teamId }),
        ...(cursor === undefined ? {} : { cursor: decodeCursor(cursor) }),
      })
      const page = toPage(rows, limit, (row) => ({ k: row.sortKey, id: row.connection.id }))
      return {
        items: await this.deps.presenter.present(
          tx,
          ctx.orgId,
          ctx.userId,
          page.items.map((item) => item.connection),
        ),
        nextCursor: page.nextCursor,
      }
    })
  }

  async get(ctx: ConnectionsContext, connectionId: string): Promise<ConnectionDto> {
    return this.deps.db.tenant(ctx.orgId, async (tx) => {
      const row = await this.findVisible(tx, ctx, connectionId)
      return this.present(tx, ctx, row)
    })
  }

  /** What a disconnect affects (T2 dialog). */
  async impact(ctx: ConnectionsContext, connectionId: string): Promise<ConnectionImpactDto> {
    return this.deps.db.tenant(ctx.orgId, async (tx) => {
      const row = await this.findVisible(tx, ctx, connectionId)
      this.assertCanChange(ctx, row)
      return this.deps.dependents.impact(tx, ctx.orgId, row.id)
    })
  }

  // ── Adding ────────────────────────────────────────────────────────────────────────────────────

  /** `POST …/connections`: everything that signs in without a browser redirect. Save checks first. */
  async create(ctx: ConnectionsContext, input: CreateConnectionInput): Promise<ConnectionDto> {
    const provider = this.deps.targets.provider(input.providerKey)
    this.deps.targets.assertAuthType(
      provider,
      input.authType,
      input.authType === 'oauth2' ? 'client_credentials' : undefined,
    )
    await this.deps.db.tenant(ctx.orgId, (tx) => this.deps.targets.assertCanAdd(tx, ctx, input))
    const baseUrl = this.deps.targets.baseUrl(provider, input.baseUrl)
    const extra = this.deps.targets.extra(provider, input.extra)

    const sealed = await this.buildSecret(input, extra)
    const outcome = await provider.adapter.check(this.deps.http, {
      authType: input.authType,
      secret: sessionOf(sealed.secret),
      baseUrl,
    })
    if (!outcome.ok) throw checkFailure(outcome)

    return this.deps.writer.create(ctx, {
      providerKey: input.providerKey,
      authType: input.authType,
      name: input.name ?? outcome.account.label ?? input.providerKey,
      scope: input.scope,
      teamId: input.scope === 'team' ? (input.teamId ?? null) : null,
      baseUrl,
      secret: sealed.secret,
      oauthScopes: sealed.oauthScopes,
      tokenExpiresAt: sealed.tokenExpiresAt,
      account: outcome.account,
    })
  }

  /** `PATCH …/:connectionId`: the label and, for self-hosted apps and MCP servers, the address. */
  async update(
    ctx: ConnectionsContext,
    connectionId: string,
    input: UpdateConnectionInput,
  ): Promise<ConnectionDto> {
    return this.deps.db.tenant(ctx.orgId, async (tx) => {
      const row = await this.findVisible(tx, ctx, connectionId)
      this.assertCanChange(ctx, row)
      if (row.status === 'revoked') throw new ConnectionRevokedError()
      let baseUrl: string | undefined
      if (input.baseUrl !== undefined) {
        baseUrl =
          this.deps.targets.baseUrl(this.deps.targets.provider(row.providerKey), input.baseUrl) ??
          undefined
      }
      const updated = await this.deps.repository.update(tx, ctx.orgId, row.id, {
        ...(input.name === undefined ? {} : { name: input.name }),
        ...(baseUrl === undefined ? {} : { baseUrl }),
      })
      if (updated === undefined) throw new ConnectionRevokedError()
      return this.present(tx, ctx, updated)
    })
  }

  // ── Reconnect, test, disconnect ───────────────────────────────────────────────────────────────

  /** `POST …/:connectionId/reconnect`: new credentials, checked like adding, for the same account. */
  async reconnect(
    ctx: ConnectionsContext,
    connectionId: string,
    input: ReconnectConnectionInput,
  ): Promise<ConnectionDto> {
    const { row, secret } = await this.deps.db.tenant(ctx.orgId, async (tx) => {
      const found = await this.findVisible(tx, ctx, connectionId)
      this.assertCanChange(ctx, found)
      if (found.status === 'revoked') throw new ConnectionRevokedError()
      const stored = await this.deps.secrets.open(
        tx,
        { id: found.id, organizationId: ctx.orgId },
        found,
      )
      return { row: found, secret: stored }
    })
    const provider = this.deps.targets.provider(row.providerKey)
    if (input.authType !== row.authType) {
      throw new ConnectionAuthTypeUnsupportedError(row.providerKey, input.authType)
    }
    if (input.authType === 'oauth2') {
      // only a client-credentials sign-in reconnects without the browser
      if (secret === null || !hasClientCredentials(secret)) {
        throw new ConnectionAuthTypeUnsupportedError(row.providerKey, 'oauth2:authorization_code')
      }
    }
    const extra = { ...secret?.extra }
    const sealed = await this.buildSecret(input, extra)
    const outcome = await provider.adapter.check(this.deps.http, {
      authType: row.authType,
      secret: sessionOf(sealed.secret),
      baseUrl: row.baseUrl,
    })
    if (!outcome.ok) throw checkFailure(outcome)
    return this.deps.writer.reconnect(ctx, row.id, {
      secret: sessionOf(sealed.secret),
      oauthScopes: sealed.oauthScopes ?? row.oauthScopes,
      tokenExpiresAt: sealed.tokenExpiresAt,
      account: outcome.account,
    })
  }

  /** `POST …/:connectionId/test`: checks now and records the status; a failure is an answer. */
  async test(ctx: ConnectionsContext, connectionId: string): Promise<ConnectionCheckDto> {
    const first = await this.load(ctx, connectionId)
    let { row, secret } = first
    if (this.isNearExpiry(row)) {
      await this.deps.tokens.refresh(ctx.orgId, row.id, ctx)
      ;({ row, secret } = await this.load(ctx, connectionId))
    }
    const provider = this.deps.targets.provider(row.providerKey)
    const outcome = await provider.adapter.check(this.deps.http, {
      authType: row.authType as ConnectionAuthType,
      secret: sessionOf(secret),
      baseUrl: row.baseUrl,
    })
    const connection = await this.deps.db.tenant(ctx.orgId, async (tx) => {
      const current = await this.deps.repository.lockById(tx, ctx.orgId, row.id)
      if (current === undefined) throw new ConnectionNotFoundError()
      if (current.status === 'revoked') throw new ConnectionRevokedError()
      const updated = await this.deps.health.record(
        tx,
        ctx,
        current,
        outcome.ok ? { ok: true } : { ok: false, reasonCode: outcome.reasonCode },
      )
      return this.present(tx, ctx, updated)
    })
    return {
      ok: outcome.ok,
      latencyMs: outcome.latencyMs,
      reasonCode: outcome.ok ? null : outcome.reasonCode,
      externalAccountLabel: outcome.ok ? outcome.account.label : connection.externalAccountLabel,
      connection,
      testedAt: this.now().toISOString(),
    }
  }

  /**
   * Disconnect (T2): the secret is gone at once and cannot come back; the app's own grant is
   * revoked afterwards when the app supports it (best effort).
   */
  async revoke(ctx: ConnectionsContext, connectionId: string): Promise<ConnectionDto> {
    const { dto, previous } = await this.deps.db.tenant(ctx.orgId, async (tx) => {
      const row = await this.findVisible(tx, ctx, connectionId)
      this.assertCanChange(ctx, row)
      if (row.status === 'revoked') throw new ConnectionRevokedError()
      const secret = await this.deps.secrets.open(
        tx,
        { id: row.id, organizationId: ctx.orgId },
        row,
      )
      const revoked = await this.deps.repository.revoke(tx, ctx.orgId, row.id, ctx.userId)
      if (revoked === undefined) throw new ConnectionRevokedError()
      await this.deps.audit.record(tx, ctx, {
        action: CONNECTION_AUDIT_ACTIONS.CONNECTION_REVOKED,
        target: { type: 'connection', id: row.id },
        metadata: { labels: { providerKey: row.providerKey, scope: row.scope } },
      })
      // the connector sources that sync through it are removed
      await this.deps.outbox.write(tx, {
        orgId: ctx.orgId,
        topic: 'connection.revoked',
        payload: { version: 1, id: row.id },
      })
      return { dto: await this.present(tx, ctx, revoked), previous: { row, secret } }
    })
    await this.revokeAtApp(previous.row, previous.secret)
    return dto
  }

  // ── Use (tools, channels, connector syncs) ───────────────────────────────────────────────────

  /** Name and status of connections by id, for the agents that use them (readiness, Needs attention). */
  async statuses(
    tx: DbExecutor,
    orgId: string,
    ids: readonly string[],
  ): Promise<ReadonlyMap<string, { name: string; status: ConnectionStatus }>> {
    const rows = await this.deps.repository.statusesOf(tx, orgId, ids)
    return new Map(
      rows.map((row) => [row.id, { name: row.name, status: row.status as ConnectionStatus }]),
    )
  }

  /**
   * Save-time rule: the person may use this connection and it works. Agents and flows call it
   * when a definition is saved; `open` applies the same rule again at run time.
   */
  async assertUsable(
    tx: DbExecutor,
    orgId: string,
    principal: ConnectionPrincipal,
    connectionId: string,
  ): Promise<ConnectionRow> {
    const row = await this.deps.repository.findById(tx, orgId, connectionId)
    if (row === undefined) throw new ConnectionNotFoundError()
    if (row.status === 'revoked') throw new ConnectionRevokedError()
    if (!isUsableBy(principal, row)) throw new ConnectionForbiddenError()
    return row
  }

  /**
   * The connection and its decrypted secret for one execution, after the usability and status
   * checks, with an OAuth token that is about to expire renewed first. The caller injects the
   * secret into its call and drops it.
   */
  async open(
    orgId: string,
    principal: ConnectionPrincipal,
    connectionId: string,
  ): Promise<ConnectionUse> {
    const ctx = { orgId, userId: null, via: 'system' as const, requestId: 'connection-use' }
    let loaded = await this.deps.db.tenant(orgId, async (tx) => {
      const row = await this.assertUsable(tx, orgId, principal, connectionId)
      return {
        row,
        secret: await this.deps.secrets.open(tx, { id: row.id, organizationId: orgId }, row),
      }
    })
    if (loaded.row.status === 'active' && this.isNearExpiry(loaded.row)) {
      await this.deps.tokens.refresh(orgId, connectionId, ctx)
      loaded = await this.deps.db.tenant(orgId, async (tx) => {
        const row = await this.assertUsable(tx, orgId, principal, connectionId)
        return {
          row,
          secret: await this.deps.secrets.open(tx, { id: row.id, organizationId: orgId }, row),
        }
      })
    }
    const { row, secret } = loaded
    if (row.status !== 'active') {
      throw new ConnectionCheckFailedError(
        (row.statusReasonCode as ConnectionStatusReasonCode | null) ??
          CONNECTIONS_ERROR_CODES.CONNECTION_PROVIDER_REJECTED,
        row.status === 'expired' ? 'The sign-in expired' : 'The app rejects this connection',
        {
          details:
            row.connectedByUserId === null ? [] : [{ connectedByUserId: row.connectedByUserId }],
        },
      )
    }
    await this.deps.lastUsed.record(orgId, connectionId)
    return {
      id: row.id,
      providerKey: row.providerKey,
      authType: row.authType as ConnectionAuthType,
      baseUrl: row.baseUrl,
      externalAccountId: row.externalAccountId,
      secret: sessionOf(secret),
    }
  }

  /**
   * A caller's request was refused by the app (401) with the token `open` gave it: the sign-in
   * is expired, with the audit entry and `connection.expired`, as when a refresh is refused.
   */
  async markExpired(orgId: string, connectionId: string): Promise<void> {
    const ctx = { orgId, userId: null, via: 'system' as const, requestId: 'connection-use' }
    await this.deps.db.tenant(orgId, async (tx) => {
      const row = await this.deps.repository.findById(tx, orgId, connectionId)
      if (row?.status !== 'active') return
      await this.deps.health.expire(tx, ctx, row, CONNECTIONS_ERROR_CODES.CONNECTION_TOKEN_EXPIRED)
    })
  }

  // ── Internals ─────────────────────────────────────────────────────────────────────────────────

  private isNearExpiry(row: ConnectionRow): boolean {
    return (
      row.authType === 'oauth2' &&
      row.tokenExpiresAt !== null &&
      row.tokenExpiresAt.getTime() - this.now().getTime() <= USE_REFRESH_WINDOW_MS
    )
  }

  /** The secret document a sign-in produces, with the token request for client credentials. */
  private async buildSecret(
    input: CreateConnectionInput | ReconnectConnectionInput,
    extra: Record<string, string>,
  ): Promise<{
    secret: ConnectionSecret | null
    oauthScopes: string[] | null
    tokenExpiresAt: Date | null
  }> {
    const withExtra = Object.keys(extra).length > 0 ? { extra } : {}
    switch (input.authType) {
      case 'api_key':
        return {
          secret: { version: 1, apiKey: input.secret, ...withExtra },
          oauthScopes: null,
          tokenExpiresAt: null,
        }
      case 'bearer':
        return {
          secret: { version: 1, token: input.secret, ...withExtra },
          oauthScopes: null,
          tokenExpiresAt: null,
        }
      case 'basic':
        return {
          secret: { version: 1, username: input.username, password: input.password, ...withExtra },
          oauthScopes: null,
          tokenExpiresAt: null,
        }
      case 'none':
        return { secret: null, oauthScopes: null, tokenExpiresAt: null }
      case 'oauth2': {
        this.deps.targets.assertAddress('tokenUrl', input.tokenUrl)
        const tokens = await this.requestClientToken(input)
        const lifetime = tokens.expiresInSeconds ?? 3600
        const stored: Record<string, string> = {
          ...extra,
          tokenUrl: input.tokenUrl,
          clientId: input.clientId,
          clientSecret: input.clientSecret,
        }
        if (Object.keys(stored).length > CONNECTION_EXTRA_MAX_ENTRIES) {
          throw new ConnectionBaseUrlNotAllowedError('extra')
        }
        return {
          secret: { version: 1, accessToken: tokens.accessToken, extra: stored },
          oauthScopes: tokens.scopes,
          tokenExpiresAt: new Date(this.now().getTime() + lifetime * 1000),
        }
      }
    }
  }

  private async requestClientToken(
    input: Extract<CreateConnectionInput | ReconnectConnectionInput, { authType: 'oauth2' }>,
  ): Promise<OauthTokens> {
    try {
      return await requestClientCredentialsToken(this.deps.http, {
        tokenUrl: input.tokenUrl,
        clientId: input.clientId,
        clientSecret: input.clientSecret,
        scopes: input.oauthScopes ?? [],
      })
    } catch (error) {
      if (!(error instanceof TokenRequestError)) throw error
      if (error.unsafeAddress) throw new ConnectionBaseUrlNotAllowedError('tokenUrl')
      throw new ConnectionCheckFailedError(
        error.kind === 'unreachable'
          ? CONNECTIONS_ERROR_CODES.CONNECTION_UNREACHABLE
          : CONNECTIONS_ERROR_CODES.CONNECTION_PROVIDER_REJECTED,
        error.message,
      )
    }
  }

  private async revokeAtApp(row: ConnectionRow, secret: ConnectionSecret | null): Promise<void> {
    if (secret === null) return
    const flow = this.deps.targets.provider(row.providerKey).adapter.authorizationCode
    const app = this.deps.oauthApps[row.providerKey]
    if (flow?.revoke === undefined || app === undefined) return
    try {
      await flow.revoke(this.deps.http, { app, secret })
    } catch {
      // the connection is already disconnected here; the app's grant can be removed at the app
    }
  }

  /** The connection and its decrypted secret, for a person who may change it. */
  private async load(
    ctx: ConnectionsContext,
    connectionId: string,
  ): Promise<{ row: ConnectionRow; secret: ConnectionSecret | null }> {
    return this.deps.db.tenant(ctx.orgId, async (tx) => {
      const row = await this.findVisible(tx, ctx, connectionId)
      this.assertCanChange(ctx, row)
      if (row.status === 'revoked') throw new ConnectionRevokedError()
      return {
        row,
        secret: await this.deps.secrets.open(tx, { id: row.id, organizationId: ctx.orgId }, row),
      }
    })
  }

  private async findVisible(
    tx: DbExecutor,
    ctx: ConnectionsContext,
    connectionId: string,
  ): Promise<ConnectionRow> {
    const row = await this.deps.repository.findById(tx, ctx.orgId, connectionId)
    if (row === undefined || !canSee(ctx, row)) throw new ConnectionNotFoundError()
    return row
  }

  private assertCanChange(ctx: ConnectionsContext, row: ConnectionRow): void {
    if (!canChange(ctx, row)) throw new ConnectionForbiddenError()
  }

  private async present(
    tx: DbExecutor,
    ctx: ConnectionsContext,
    row: ConnectionRow,
  ): Promise<ConnectionDto> {
    const [dto] = await this.deps.presenter.present(tx, ctx.orgId, ctx.userId, [row])
    if (dto === undefined) throw new Error('presenter returned no connection')
    return dto
  }
}
