// SPDX-License-Identifier: AGPL-3.0-only
import { CONNECTION_AUDIT_ACTIONS } from '@surefy/contracts'
import type {
  ConnectionAuthType,
  ConnectionDto,
  ConnectionScope,
  ConnectionSecret,
} from '@surefy/contracts'

import { canChange } from './connections.access.js'
import {
  ConnectionAccountMismatchError,
  ConnectionDuplicateError,
  ConnectionForbiddenError,
  ConnectionNotFoundError,
  ConnectionRevokedError,
} from './connections.errors.js'
import { NO_SECRET } from './connections.secrets.js'

import type { ConnectionsRepository } from './connections.repository.js'
import type { ConnectionSecrets, SealedSecret } from './connections.secrets.js'
import type { ConnectionsContext, ConnectionsOutbox } from './connections.types.js'
import type { ConnectionPresenter } from './connectionsPresenter.js'
import type { ProviderAccount } from './providers/index.js'
import type { Database, DbExecutor } from '@/core/database/index.js'
import type { AuditRecorder } from '@/modules/audit/index.js'

/** Everything a stored connection holds, as the service and the OAuth flow build it. */
export interface ConnectionSpec {
  providerKey: string
  authType: ConnectionAuthType
  name: string
  scope: ConnectionScope
  teamId: string | null
  baseUrl: string | null
  /** Null for a connection without a sign-in. */
  secret: ConnectionSecret | null
  oauthScopes: string[] | null
  tokenExpiresAt: Date | null
  account: ProviderAccount
}

export interface ReconnectSpec {
  secret: ConnectionSecret
  oauthScopes: string[] | null
  tokenExpiresAt: Date | null
  account: ProviderAccount
}

/** A unique violation, however deeply the driver wrapped it. */
export function isUniqueViolation(error: unknown): boolean {
  let current: unknown = error
  for (let depth = 0; depth < 4 && typeof current === 'object' && current !== null; depth += 1) {
    if ((current as { code?: unknown }).code === '23505') return true
    current = (current as { cause?: unknown }).cause
  }
  return false
}

/**
 * Storing a checked sign-in as a new connection, or onto an existing one (Reconnect). The same
 * account is never added twice in one scope; a reconnect must be to the same account.
 */
export class ConnectionWriter {
  constructor(
    private readonly deps: {
      db: Database
      repository: ConnectionsRepository
      secrets: ConnectionSecrets
      presenter: ConnectionPresenter
      audit: AuditRecorder
      outbox: ConnectionsOutbox
    },
  ) {}

  async create(ctx: ConnectionsContext, spec: ConnectionSpec): Promise<ConnectionDto> {
    try {
      return await this.deps.db.tenant(ctx.orgId, (tx) => this.insert(tx, ctx, spec))
    } catch (error) {
      if (!isUniqueViolation(error)) throw error
      // lost the race to a concurrent add of the same account
      const existing = await this.deps.db.tenant(ctx.orgId, (tx) =>
        this.findDuplicate(tx, ctx, spec),
      )
      if (existing === undefined) throw error
      throw new ConnectionDuplicateError(existing.id)
    }
  }

  async reconnect(
    ctx: ConnectionsContext,
    connectionId: string,
    spec: ReconnectSpec,
  ): Promise<ConnectionDto> {
    return this.deps.db.tenant(ctx.orgId, async (tx) => {
      const row = await this.deps.repository.lockById(tx, ctx.orgId, connectionId)
      if (row === undefined) throw new ConnectionNotFoundError()
      if (row.status === 'revoked') throw new ConnectionRevokedError()
      if (!canChange(ctx, row)) throw new ConnectionForbiddenError()
      if (
        row.externalAccountId !== null &&
        spec.account.id !== null &&
        row.externalAccountId !== spec.account.id
      ) {
        throw new ConnectionAccountMismatchError(row.externalAccountLabel)
      }
      const updated = await this.deps.repository.replaceSecret(tx, ctx.orgId, row.id, {
        sealed: await this.deps.secrets.seal(
          tx,
          { id: row.id, organizationId: ctx.orgId },
          spec.secret,
        ),
        oauthScopes: spec.oauthScopes,
        tokenExpiresAt: spec.tokenExpiresAt,
        lastRefreshedAt: new Date(),
        connectedByUserId: ctx.userId,
        ...(row.externalAccountId === null
          ? {
              externalAccountId: spec.account.id,
              externalAccountLabel: spec.account.label ?? row.externalAccountLabel,
            }
          : {}),
      })
      if (updated === undefined) throw new ConnectionRevokedError()
      await this.deps.audit.record(tx, ctx, {
        action: CONNECTION_AUDIT_ACTIONS.CONNECTION_RECONNECTED,
        target: { type: 'connection', id: row.id },
        metadata: { labels: { providerKey: row.providerKey, scope: row.scope } },
      })
      // what paused on the expired sign-in (connector syncs) resumes
      await this.deps.outbox.write(tx, {
        orgId: ctx.orgId,
        topic: 'connection.reconnected',
        payload: { version: 1, id: row.id },
      })
      const [dto] = await this.deps.presenter.present(tx, ctx.orgId, ctx.userId, [updated])
      if (dto === undefined) throw new Error('presenter returned no connection')
      return dto
    })
  }

  private async insert(
    tx: DbExecutor,
    ctx: ConnectionsContext,
    spec: ConnectionSpec,
  ): Promise<ConnectionDto> {
    const duplicate = await this.findDuplicate(tx, ctx, spec)
    if (duplicate !== undefined) throw new ConnectionDuplicateError(duplicate.id)
    const id = await this.deps.repository.newId(tx)
    const sealed: SealedSecret | typeof NO_SECRET =
      spec.secret === null
        ? NO_SECRET
        : await this.deps.secrets.seal(tx, { id, organizationId: ctx.orgId }, spec.secret)
    const row = await this.deps.repository.insert(tx, {
      id,
      organizationId: ctx.orgId,
      providerKey: spec.providerKey,
      authType: spec.authType,
      name: spec.name,
      scope: spec.scope,
      teamId: spec.teamId,
      ownerUserId: spec.scope === 'personal' ? ctx.userId : null,
      baseUrl: spec.baseUrl,
      ...sealed,
      oauthScopes: spec.oauthScopes,
      externalAccountId: spec.account.id,
      externalAccountLabel: spec.account.label,
      status: 'active',
      tokenExpiresAt: spec.tokenExpiresAt,
      lastRefreshedAt: spec.authType === 'oauth2' ? new Date() : null,
      connectedByUserId: ctx.userId,
    })
    await this.deps.audit.record(tx, ctx, {
      action: CONNECTION_AUDIT_ACTIONS.CONNECTION_CREATED,
      target: { type: 'connection', id },
      metadata: {
        labels: { providerKey: spec.providerKey, scope: spec.scope, authType: spec.authType },
      },
    })
    const [dto] = await this.deps.presenter.present(tx, ctx.orgId, ctx.userId, [row])
    if (dto === undefined) throw new Error('presenter returned no connection')
    return dto
  }

  private async findDuplicate(
    tx: DbExecutor,
    ctx: ConnectionsContext,
    spec: ConnectionSpec,
  ): Promise<{ id: string } | undefined> {
    if (spec.account.id === null) return undefined
    return this.deps.repository.findByAccount(tx, ctx.orgId, {
      providerKey: spec.providerKey,
      externalAccountId: spec.account.id,
      scope: spec.scope,
      teamId: spec.teamId,
      ownerUserId: spec.scope === 'personal' ? ctx.userId : null,
    })
  }
}
