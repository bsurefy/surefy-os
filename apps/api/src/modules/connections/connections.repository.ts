// SPDX-License-Identifier: AGPL-3.0-only
import {
  and,
  count,
  eq,
  ilike,
  inArray,
  isNotNull,
  lt,
  lte,
  ne,
  notInArray,
  or,
  sql,
  type SQL,
} from 'drizzle-orm'

import { connections, organizationMembers } from '@/database/tables/index.js'
import {
  keysetAfter,
  keysetKey,
  keysetOrder,
  parseSort,
  type KeysetCursor,
  type KeysetSort,
} from '@/lib/pagination.js'
import type {
  ConnectionScope,
  ConnectionStatus,
  ConnectionStatusReasonCode,
} from '@surefy/contracts'

import { NO_SECRET, type SealedSecret } from './connections.secrets.js'

import type { ConnectionPrincipal } from './connections.types.js'
import type { DbExecutor } from '@/core/database/index.js'

export type ConnectionRow = typeof connections.$inferSelect
export type NewConnectionRow = typeof connections.$inferInsert

const c = connections

const allOf = (...conditions: (SQL | undefined)[]): SQL => and(...conditions) ?? sql`true`
const anyOf = (...conditions: (SQL | undefined)[]): SQL => or(...conditions) ?? sql`false`

/** Escapes `%`, `_` and `\` so a search term matches literally. */
const likeTerm = (q: string): string => `%${q.replaceAll(/[\\%_]/g, (ch) => '\\' + ch)}%`

/** `?sort=` of the list: by name (the default), creation time or last use (never-used last). */
export const connectionSort = (sort: string | undefined): KeysetSort => {
  const { field, descending } = parseSort<'name' | 'createdAt' | 'lastUsedAt'>(sort, 'name')
  if (field === 'name') return { expression: sql`lower(${c.name})`, cast: 'text', descending }
  if (field === 'createdAt') return { expression: c.createdAt, cast: 'timestamptz', descending }
  return {
    expression: sql`coalesce(${c.lastUsedAt}, '-infinity'::timestamptz)`,
    cast: 'timestamptz',
    descending,
  }
}

/**
 * Connections the principal may use: their own personal ones, their teams' and the
 * organization's (database/bridge-and-connections.md, "Who uses it").
 */
export function usableBy(principal: ConnectionPrincipal): SQL {
  const conditions: SQL[] = [eq(c.scope, 'organization')]
  if (principal.userId !== null) {
    conditions.push(allOf(eq(c.scope, 'personal'), eq(c.ownerUserId, principal.userId)))
  }
  if (principal.teamIds.length > 0) {
    conditions.push(allOf(eq(c.scope, 'team'), inArray(c.teamId, [...principal.teamIds])))
  }
  return anyOf(...conditions)
}

/** Connections a person without `connections:manage` sees in the list: the ones they own or added. */
export function ownedBy(userId: string | null): SQL | undefined {
  if (userId === null) return sql`false`
  return or(eq(c.ownerUserId, userId), eq(c.connectedByUserId, userId))
}

export interface ConnectionPageParams {
  limit: number
  sort: KeysetSort
  cursor?: KeysetCursor
  q?: string
  providerKeys?: readonly string[]
  /** The provider keys of the wanted kinds; `bridge` adds every key that is not built in. */
  kindProviderKeys?: readonly string[]
  includeBridges?: boolean
  builtInKeys: readonly string[]
  scopes?: readonly ConnectionScope[]
  statuses?: readonly ConnectionStatus[]
  teamId?: string
  /** Rows the caller may see at all (null: every row). */
  visibility: SQL | undefined
}

/** The identity of an account within a scope: the unique index `connections_external_account_key`. */
export interface AccountSlot {
  providerKey: string
  externalAccountId: string
  scope: ConnectionScope
  teamId: string | null
  ownerUserId: string | null
}

/** A buffered use of a connection, ready to be written. */
export interface LastUsedEntry {
  orgId: string
  connectionId: string
  at: Date
}

/**
 * `connections`. Every tenant query filters by organization even though RLS does too. The secret
 * columns are read through `ConnectionSecrets` only, inside the call path that needs the plain text.
 */
export class ConnectionsRepository {
  /** A uuidv7 from Postgres: the row id is part of the secret's AAD, so it is known first. */
  async newId(tx: DbExecutor): Promise<string> {
    const result = await tx.execute<{ id: string }>(sql`select uuidv7() as id`)
    const id = result.rows[0]?.id
    if (id === undefined) throw new Error('uuidv7() returned no row')
    return id
  }

  async insert(tx: DbExecutor, values: NewConnectionRow): Promise<ConnectionRow> {
    const [row] = await tx.insert(c).values(values).returning()
    if (row === undefined) throw new Error('connection insert returned no row')
    return row
  }

  findById(tx: DbExecutor, orgId: string, id: string) {
    return tx.query.connections.findFirst({
      where: and(eq(c.organizationId, orgId), eq(c.id, id)),
    })
  }

  /** `for update`: a refresh and a reconnect of one connection take turns. */
  async lockById(tx: DbExecutor, orgId: string, id: string): Promise<ConnectionRow | undefined> {
    const [row] = await tx
      .select()
      .from(c)
      .where(and(eq(c.organizationId, orgId), eq(c.id, id)))
      .for('update')
    return row
  }

  /** The not-disconnected connection of this account in this scope, if any. */
  async findByAccount(tx: DbExecutor, orgId: string, slot: AccountSlot) {
    const [row] = await tx
      .select({ id: c.id })
      .from(c)
      .where(
        and(
          eq(c.organizationId, orgId),
          eq(c.providerKey, slot.providerKey),
          eq(c.externalAccountId, slot.externalAccountId),
          eq(c.scope, slot.scope),
          slot.teamId === null ? sql`${c.teamId} is null` : eq(c.teamId, slot.teamId),
          slot.ownerUserId === null
            ? sql`${c.ownerUserId} is null`
            : eq(c.ownerUserId, slot.ownerUserId),
          ne(c.status, 'revoked'),
        ),
      )
      .limit(1)
    return row
  }

  listPage(tx: DbExecutor, orgId: string, page: ConnectionPageParams) {
    const kindConditions: SQL[] = []
    if (page.kindProviderKeys !== undefined && page.kindProviderKeys.length > 0) {
      kindConditions.push(inArray(c.providerKey, [...page.kindProviderKeys]))
    }
    if (page.includeBridges === true) {
      kindConditions.push(notInArray(c.providerKey, [...page.builtInKeys]))
    }
    const wantsKind = page.kindProviderKeys !== undefined || page.includeBridges === true
    const kindCondition = wantsKind ? anyOf(...kindConditions) : undefined
    return tx
      .select({ connection: c, sortKey: keysetKey(page.sort) })
      .from(c)
      .where(
        and(
          eq(c.organizationId, orgId),
          page.visibility,
          page.q === undefined
            ? undefined
            : or(ilike(c.name, likeTerm(page.q)), ilike(c.externalAccountLabel, likeTerm(page.q))),
          page.providerKeys === undefined || page.providerKeys.length === 0
            ? undefined
            : inArray(c.providerKey, [...page.providerKeys]),
          kindCondition,
          page.scopes === undefined || page.scopes.length === 0
            ? undefined
            : inArray(c.scope, [...page.scopes]),
          // disconnected connections stay hidden until the Status filter asks for them
          page.statuses === undefined || page.statuses.length === 0
            ? ne(c.status, 'revoked')
            : inArray(c.status, [...page.statuses]),
          page.teamId === undefined ? undefined : eq(c.teamId, page.teamId),
          keysetAfter(page.sort, c.id, page.cursor),
        ),
      )
      .orderBy(...keysetOrder(page.sort, c.id))
      .limit(page.limit + 1)
  }

  /** Non-revoked connections the caller may use, per provider key. */
  async usableCountsByProvider(
    tx: DbExecutor,
    orgId: string,
    principal: ConnectionPrincipal,
  ): Promise<Map<string, number>> {
    const rows = await tx
      .select({ providerKey: c.providerKey, total: count() })
      .from(c)
      .where(and(eq(c.organizationId, orgId), ne(c.status, 'revoked'), usableBy(principal)))
      .groupBy(c.providerKey)
    return new Map(rows.map((row) => [row.providerKey, row.total]))
  }

  /** Not-disconnected connections of a team: what its deletion takes with it. */
  async countByTeam(tx: DbExecutor, orgId: string, teamId: string): Promise<number> {
    const [row] = await tx
      .select({ total: count() })
      .from(c)
      .where(and(eq(c.organizationId, orgId), eq(c.teamId, teamId), ne(c.status, 'revoked')))
    return row?.total ?? 0
  }

  async update(
    tx: DbExecutor,
    orgId: string,
    id: string,
    values: Partial<Pick<NewConnectionRow, 'name' | 'baseUrl'>>,
  ): Promise<ConnectionRow | undefined> {
    const [row] = await tx
      .update(c)
      .set(values)
      .where(and(eq(c.organizationId, orgId), eq(c.id, id), ne(c.status, 'revoked')))
      .returning()
    return row
  }

  /** New credentials after a sign-in, a reconnect or a refresh; the connection is `active` again. */
  async replaceSecret(
    tx: DbExecutor,
    orgId: string,
    id: string,
    values: {
      sealed: SealedSecret
      oauthScopes: string[] | null
      tokenExpiresAt: Date | null
      lastRefreshedAt: Date | null
      externalAccountId?: string | null
      externalAccountLabel?: string | null
      baseUrl?: string | null
      connectedByUserId?: string | null
    },
  ): Promise<ConnectionRow | undefined> {
    const { sealed, ...rest } = values
    const [row] = await tx
      .update(c)
      .set({ ...sealed, ...rest, status: 'active', statusReasonCode: null })
      .where(and(eq(c.organizationId, orgId), eq(c.id, id), ne(c.status, 'revoked')))
      .returning()
    return row
  }

  async setStatus(
    tx: DbExecutor,
    orgId: string,
    id: string,
    status: Exclude<ConnectionStatus, 'revoked'>,
    reasonCode: ConnectionStatusReasonCode | null,
  ): Promise<ConnectionRow | undefined> {
    const [row] = await tx
      .update(c)
      .set({ status, statusReasonCode: reasonCode })
      .where(and(eq(c.organizationId, orgId), eq(c.id, id), ne(c.status, 'revoked')))
      .returning()
    return row
  }

  /** One statement: the secret goes with the status, so nothing can use the connection again. */
  async revoke(
    tx: DbExecutor,
    orgId: string,
    id: string,
    revokedByUserId: string | null,
  ): Promise<ConnectionRow | undefined> {
    const [row] = await tx
      .update(c)
      .set({
        ...NO_SECRET,
        status: 'revoked',
        statusReasonCode: null,
        tokenExpiresAt: null,
        revokedAt: new Date(),
        revokedByUserId,
      })
      .where(and(eq(c.organizationId, orgId), eq(c.id, id), ne(c.status, 'revoked')))
      .returning()
    return row
  }

  /** Member removal: every personal connection of the person is disconnected (returns them). */
  async revokePersonalOf(
    tx: DbExecutor,
    orgId: string,
    ownerUserId: string,
    revokedByUserId: string | null,
  ): Promise<{ id: string; providerKey: string }[]> {
    return tx
      .update(c)
      .set({
        ...NO_SECRET,
        status: 'revoked',
        statusReasonCode: null,
        tokenExpiresAt: null,
        revokedAt: new Date(),
        revokedByUserId,
      })
      .where(
        and(
          eq(c.organizationId, orgId),
          eq(c.scope, 'personal'),
          eq(c.ownerUserId, ownerUserId),
          ne(c.status, 'revoked'),
        ),
      )
      .returning({ id: c.id, providerKey: c.providerKey })
  }

  /** Active OAuth 2 connections whose access token expires by `before` (system scope). */
  dueForRefresh(tx: DbExecutor, before: Date, limit: number) {
    return tx
      .select({ id: c.id, organizationId: c.organizationId })
      .from(c)
      .where(
        and(
          eq(c.status, 'active'),
          eq(c.authType, 'oauth2'),
          isNotNull(c.tokenExpiresAt),
          lte(c.tokenExpiresAt, before),
        ),
      )
      .orderBy(c.tokenExpiresAt)
      .limit(limit)
  }

  /** Active Admins and Owners: who hears about a connection nobody can be asked about. */
  async managerIds(tx: DbExecutor, orgId: string): Promise<string[]> {
    const rows = await tx
      .select({ userId: organizationMembers.userId })
      .from(organizationMembers)
      .where(
        and(
          eq(organizationMembers.organizationId, orgId),
          eq(organizationMembers.status, 'active'),
          inArray(organizationMembers.role, ['admin', 'owner']),
        ),
      )
    return rows.map((row) => row.userId)
  }

  async isActiveMember(tx: DbExecutor, orgId: string, userId: string): Promise<boolean> {
    const [row] = await tx
      .select({ userId: organizationMembers.userId })
      .from(organizationMembers)
      .where(
        and(
          eq(organizationMembers.organizationId, orgId),
          eq(organizationMembers.userId, userId),
          eq(organizationMembers.status, 'active'),
        ),
      )
      .limit(1)
    return row !== undefined
  }

  /** Writes the buffered uses (system scope); a use never moves `last_used_at` backwards. */
  async writeLastUsed(tx: DbExecutor, entries: readonly LastUsedEntry[]): Promise<number> {
    if (entries.length === 0) return 0
    const values = sql.join(
      entries.map(
        (entry) =>
          sql`(${entry.orgId}::uuid, ${entry.connectionId}::uuid, ${entry.at.toISOString()}::timestamptz)`,
      ),
      sql`, `,
    )
    const result = await tx.execute(sql`
      update connections k set last_used_at = v.at
      from (values ${values}) as v(organization_id, id, at)
      where k.organization_id = v.organization_id and k.id = v.id
        and (k.last_used_at is null or k.last_used_at < v.at)
    `)
    return result.rowCount ?? 0
  }

  /** Disconnected connections past their retention (system scope): the row goes, its audit entries stay. */
  async deleteRevokedBefore(tx: DbExecutor, before: Date, limit: number): Promise<number> {
    const doomed = tx
      .select({ id: c.id })
      .from(c)
      .where(and(eq(c.status, 'revoked'), isNotNull(c.revokedAt), lt(c.revokedAt, before)))
      .limit(limit)
    const deleted = await tx.delete(c).where(inArray(c.id, doomed)).returning({ id: c.id })
    return deleted.length
  }
}
