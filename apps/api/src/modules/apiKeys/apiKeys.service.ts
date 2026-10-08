// SPDX-License-Identifier: AGPL-3.0-only
import { type Database, type DbExecutor } from '@/core/database/index.js'
import { decodeCursor, toPage } from '@/lib/pagination.js'
import { API_KEY_AUDIT_ACTIONS, isApiKeyScopeAllowed, PERMISSIONS } from '@surefy/contracts'
import type {
  ApiKeyCreatedDto,
  ApiKeyDto,
  ApiKeyImpactDto,
  CreateApiKeyInput,
  ListApiKeysQuery,
  UpdateApiKeyInput,
  UserRefDto,
} from '@surefy/contracts'

import {
  ApiKeyExpiryInvalidError,
  ApiKeyNotFoundError,
  ApiKeyRevokedError,
  ApiKeyScopeExceedsCreatorError,
  ApiKeyScopeNotAllowedError,
} from './apiKeys.errors.js'
import { toApiKeyDto } from './apiKeys.mapper.js'
import { apiKeySort, type ApiKeyRow, type ApiKeysRepository } from './apiKeys.repository.js'
import { generateApiKey } from './apiKeys.utils.js'

import type { ApiKeysAccess, ApiKeysContext, ApiKeyUserRefs } from './apiKeys.types.js'
import type { AuditRecorder } from '@/modules/audit/index.js'

export interface ApiKeysServiceDeps {
  db: Database
  repository: ApiKeysRepository
  access: ApiKeysAccess
  users: ApiKeyUserRefs
  audit: AuditRecorder
  /** The clock; tests pass a fixed one. */
  now?: () => Date
}

const KNOWN_PERMISSIONS: ReadonlySet<string> = new Set(Object.values(PERMISSIONS))

/**
 * Organization API keys (access-and-entitlements.md, §2). The full key exists only in the answer
 * of `create`; afterwards only its prefix is shown and only its hash is kept.
 */
export class ApiKeysService {
  constructor(private readonly deps: ApiKeysServiceDeps) {}

  async list(
    ctx: ApiKeysContext,
    query: ListApiKeysQuery,
  ): Promise<{ items: ApiKeyDto[]; nextCursor: string | null }> {
    const sort = apiKeySort(query.sort)
    const rows = await this.deps.db.tenant(ctx.orgId, (tx) =>
      this.deps.repository.listPage(tx, ctx.orgId, {
        limit: query.limit,
        sort,
        ...(query.q === undefined ? {} : { q: query.q }),
        ...(query.status === undefined ? {} : { statuses: query.status }),
        ...(query.cursor === undefined ? {} : { cursor: decodeCursor(query.cursor) }),
      }),
    )
    const { items, nextCursor } = toPage(rows, query.limit, (row) => ({
      k: row.sortKey,
      id: row.apiKey.id,
    }))
    const refs = await this.refsOf(items.map((item) => item.apiKey))
    const now = this.now()
    return { items: items.map((item) => toApiKeyDto(item.apiKey, refs, now)), nextCursor }
  }

  async get(ctx: ApiKeysContext, keyId: string): Promise<ApiKeyDto> {
    const row = await this.deps.db.tenant(ctx.orgId, (tx) => this.findOrThrow(tx, ctx.orgId, keyId))
    return this.toDto(row)
  }

  /**
   * Needs a sign-in within the last 10 minutes, before any work starts. The scopes must be known
   * permissions that keys may carry and that the creator holds; the expiry must be in the future.
   */
  async create(ctx: ApiKeysContext, input: CreateApiKeyInput): Promise<ApiKeyCreatedDto> {
    this.deps.access.assertFreshSession(ctx)
    this.assertScopes(ctx, input.scopes)
    const expiresAt = input.expiresAt === undefined ? null : new Date(input.expiresAt)
    if (expiresAt !== null && expiresAt.getTime() <= this.now().getTime()) {
      throw new ApiKeyExpiryInvalidError()
    }
    const key = generateApiKey()
    const row = await this.deps.db.tenant(ctx.orgId, async (tx) => {
      const created = await this.deps.repository.insert(tx, {
        organizationId: ctx.orgId,
        name: input.name,
        keyPrefix: key.prefix,
        keyHash: key.hash,
        scopes: [...input.scopes],
        expiresAt,
        createdByUserId: ctx.userId,
      })
      // never the key, its hash or its prefix: only what it may do
      await this.deps.audit.record(tx, ctx, {
        action: API_KEY_AUDIT_ACTIONS.API_KEY_CREATED,
        target: { type: 'api_key', id: created.id },
        metadata: {
          labels: {
            name: created.name,
            scopes: input.scopes.join(','),
            expires: expiresAt !== null,
          },
          counts: { scopes: input.scopes.length },
        },
      })
      return created
    })
    return { apiKey: await this.toDto(row), secret: key.secret }
  }

  /** The label only; scopes and expiry are fixed at creation. */
  async rename(ctx: ApiKeysContext, keyId: string, input: UpdateApiKeyInput): Promise<ApiKeyDto> {
    const row = await this.deps.db.tenant(ctx.orgId, async (tx) => {
      const current = await this.findOrThrow(tx, ctx.orgId, keyId)
      if (current.status === 'revoked') throw new ApiKeyRevokedError()
      const updated = await this.deps.repository.rename(tx, ctx.orgId, keyId, input.name)
      if (updated === undefined) throw new ApiKeyRevokedError()
      if (current.name !== updated.name) {
        await this.deps.audit.record(tx, ctx, {
          action: API_KEY_AUDIT_ACTIONS.API_KEY_UPDATED,
          target: { type: 'api_key', id: keyId },
          metadata: { changes: [{ field: 'name', from: current.name, to: updated.name }] },
        })
      }
      return updated
    })
    return this.toDto(row)
  }

  /**
   * What stops working when the key is revoked. Agents and channels record their dependency once
   * they exist (`dependency_edges`); until then nothing depends on a key.
   */
  async impact(ctx: ApiKeysContext, keyId: string): Promise<ApiKeyImpactDto> {
    await this.deps.db.tenant(ctx.orgId, (tx) => this.findOrThrow(tx, ctx.orgId, keyId))
    return { dependents: [], listed: [] }
  }

  /** Terminal: the hash is cleared in the same statement, so the next call with the key fails. */
  async revoke(ctx: ApiKeysContext, keyId: string): Promise<ApiKeyDto> {
    const row = await this.deps.db.tenant(ctx.orgId, async (tx) => {
      const current = await this.findOrThrow(tx, ctx.orgId, keyId)
      if (current.status === 'revoked') throw new ApiKeyRevokedError()
      const revoked = await this.deps.repository.revoke(tx, ctx.orgId, keyId, ctx.userId)
      if (revoked === undefined) throw new ApiKeyRevokedError()
      await this.deps.audit.record(tx, ctx, {
        action: API_KEY_AUDIT_ACTIONS.API_KEY_REVOKED,
        target: { type: 'api_key', id: keyId },
        metadata: { labels: { name: revoked.name } },
      })
      return revoked
    })
    return this.toDto(row)
  }

  // ---- Private ------------------------------------------------------------------------------

  private now(): Date {
    return this.deps.now?.() ?? new Date()
  }

  private assertScopes(ctx: ApiKeysContext, scopes: readonly string[]): void {
    for (const scope of scopes) {
      if (!KNOWN_PERMISSIONS.has(scope) || !isApiKeyScopeAllowed(scope)) {
        throw new ApiKeyScopeNotAllowedError(scope)
      }
    }
    const held = new Set<string>(ctx.access.permissions)
    const missing = scopes.filter((scope) => !held.has(scope))
    if (missing.length > 0) throw new ApiKeyScopeExceedsCreatorError(missing)
  }

  private async findOrThrow(tx: DbExecutor, orgId: string, keyId: string): Promise<ApiKeyRow> {
    const row = await this.deps.repository.findById(tx, orgId, keyId)
    if (row === undefined) throw new ApiKeyNotFoundError()
    return row
  }

  private async refsOf(rows: readonly ApiKeyRow[]): Promise<ReadonlyMap<string, UserRefDto>> {
    const ids = new Set<string>()
    for (const row of rows) {
      if (row.createdByUserId !== null) ids.add(row.createdByUserId)
      if (row.revokedByUserId !== null) ids.add(row.revokedByUserId)
    }
    return ids.size === 0 ? new Map() : this.deps.users.findUserRefs([...ids])
  }

  private async toDto(row: ApiKeyRow): Promise<ApiKeyDto> {
    return toApiKeyDto(row, await this.refsOf([row]), this.now())
  }
}
