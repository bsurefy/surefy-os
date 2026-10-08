// SPDX-License-Identifier: AGPL-3.0-only
import { and, eq, ilike, inArray, isNotNull, lt, sql } from 'drizzle-orm'

import { apiKeys } from '@/database/tables/index.js'
import {
  keysetAfter,
  keysetKey,
  keysetOrder,
  parseSort,
  type KeysetCursor,
  type KeysetSort,
} from '@/lib/pagination.js'
import type { ApiKeyStatus } from '@surefy/contracts'

import type { DbExecutor } from '@/core/database/index.js'

export type ApiKeyRow = typeof apiKeys.$inferSelect
export type NewApiKeyRow = typeof apiKeys.$inferInsert

export interface ApiKeyPageParams {
  limit: number
  cursor?: KeysetCursor
  sort: KeysetSort
  q?: string
  statuses?: readonly ApiKeyStatus[]
}

/** A buffered use of a key, ready to be written. */
export interface LastUsedEntry {
  orgId: string
  keyId: string
  at: Date
  ip: string | null
}

/** Escapes `%`, `_` and `\` so a search term matches literally. */
const likeTerm = (q: string): string => `%${q.replaceAll(/[\\%_]/g, (c) => '\\' + c)}%`

/** `?sort=` of the list: by name (case-insensitive), creation time (the default) or last use. */
export const apiKeySort = (sort: string | undefined): KeysetSort => {
  const { field, descending } = parseSort<'name' | 'createdAt' | 'lastUsedAt'>(sort, '-createdAt')
  if (field === 'name') return { expression: sql`lower(${apiKeys.name})`, cast: 'text', descending }
  if (field === 'lastUsedAt') {
    // unused keys sort as the oldest, so the cursor always has a value
    return {
      expression: sql`coalesce(${apiKeys.lastUsedAt}, 'epoch'::timestamptz)`,
      cast: 'timestamptz',
      descending,
    }
  }
  return { expression: apiKeys.createdAt, cast: 'timestamptz', descending }
}

/** `api_keys`. Every tenant query filters by organization even though RLS does too. */
export class ApiKeysRepository {
  async insert(tx: DbExecutor, values: NewApiKeyRow): Promise<ApiKeyRow> {
    const [row] = await tx.insert(apiKeys).values(values).returning()
    if (row === undefined) throw new Error('api key insert returned no row')
    return row
  }

  findById(tx: DbExecutor, orgId: string, keyId: string) {
    return tx.query.apiKeys.findFirst({
      where: and(eq(apiKeys.organizationId, orgId), eq(apiKeys.id, keyId)),
    })
  }

  listPage(tx: DbExecutor, orgId: string, page: ApiKeyPageParams) {
    return tx
      .select({ apiKey: apiKeys, sortKey: keysetKey(page.sort) })
      .from(apiKeys)
      .where(
        and(
          eq(apiKeys.organizationId, orgId),
          page.q === undefined ? undefined : ilike(apiKeys.name, likeTerm(page.q)),
          page.statuses === undefined || page.statuses.length === 0
            ? undefined
            : inArray(apiKeys.status, [...page.statuses]),
          keysetAfter(page.sort, apiKeys.id, page.cursor),
        ),
      )
      .orderBy(...keysetOrder(page.sort, apiKeys.id))
      .limit(page.limit + 1)
  }

  async rename(
    tx: DbExecutor,
    orgId: string,
    keyId: string,
    name: string,
  ): Promise<ApiKeyRow | undefined> {
    const [row] = await tx
      .update(apiKeys)
      .set({ name })
      .where(
        and(eq(apiKeys.organizationId, orgId), eq(apiKeys.id, keyId), eq(apiKeys.status, 'active')),
      )
      .returning()
    return row
  }

  /** One statement: the hash goes with the status, so the key stops resolving at once. */
  async revoke(
    tx: DbExecutor,
    orgId: string,
    keyId: string,
    revokedByUserId: string | null,
  ): Promise<ApiKeyRow | undefined> {
    const [row] = await tx
      .update(apiKeys)
      .set({ status: 'revoked', keyHash: null, revokedAt: new Date(), revokedByUserId })
      .where(
        and(eq(apiKeys.organizationId, orgId), eq(apiKeys.id, keyId), eq(apiKeys.status, 'active')),
      )
      .returning()
    return row
  }

  /** Definer `auth_resolve_api_key`: an active, unexpired key of an active organization. */
  async resolve(executor: DbExecutor, keyHash: Buffer) {
    const result = await executor.execute<{
      api_key_id: string
      organization_id: string
      scopes: string[]
      expires_at: Date | null
    }>(
      sql`select api_key_id, organization_id, scopes, expires_at from auth_resolve_api_key(${keyHash})`,
    )
    const row = result.rows[0]
    if (row === undefined) return
    return { keyId: row.api_key_id, orgId: row.organization_id, scopes: row.scopes }
  }

  /** Writes the buffered uses (system scope); a use never moves `last_used_at` backwards. */
  async writeLastUsed(tx: DbExecutor, entries: readonly LastUsedEntry[]): Promise<number> {
    if (entries.length === 0) return 0
    const values = sql.join(
      entries.map(
        (entry) =>
          sql`(${entry.orgId}::uuid, ${entry.keyId}::uuid, ${entry.at.toISOString()}::timestamptz, ${entry.ip}::inet)`,
      ),
      sql`, `,
    )
    const result = await tx.execute(sql`
      update api_keys k set last_used_at = v.at, last_used_ip = v.ip
      from (values ${values}) as v(organization_id, id, at, ip)
      where k.organization_id = v.organization_id and k.id = v.id
        and (k.last_used_at is null or k.last_used_at < v.at)
    `)
    return result.rowCount ?? 0
  }

  /** Revoked keys past their retention (system scope): the row goes, its audit entries stay. */
  async deleteRevokedBefore(tx: DbExecutor, before: Date, limit: number): Promise<number> {
    const doomed = tx
      .select({ id: apiKeys.id })
      .from(apiKeys)
      .where(
        and(
          eq(apiKeys.status, 'revoked'),
          isNotNull(apiKeys.revokedAt),
          lt(apiKeys.revokedAt, before),
        ),
      )
      .limit(limit)
    const deleted = await tx
      .delete(apiKeys)
      .where(inArray(apiKeys.id, doomed))
      .returning({ id: apiKeys.id })
    return deleted.length
  }
}
