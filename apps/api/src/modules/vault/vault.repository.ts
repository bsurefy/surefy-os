// SPDX-License-Identifier: AGPL-3.0-only
import {
  and,
  asc,
  count,
  eq,
  ilike,
  inArray,
  isNull,
  min,
  ne,
  or,
  sql,
  type SQL,
} from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'

import { vaultCredentials, vaultModels } from '@/database/tables/index.js'
import {
  keysetAfter,
  keysetKey,
  keysetOrder,
  parseSort,
  type KeysetCursor,
  type KeysetSort,
} from '@/lib/pagination.js'
import type {
  CredentialKind,
  CredentialScope,
  CredentialStatus,
  ListCredentialsQuery,
} from '@surefy/contracts'

import type { DbExecutor } from '@/core/database/index.js'

export type CredentialRow = typeof vaultCredentials.$inferSelect
export type NewCredentialRow = typeof vaultCredentials.$inferInsert

const vc = vaultCredentials
const replacement = alias(vaultCredentials, 'replacement')

const likeTerm = (q: string): string => `%${q.replaceAll(/[\\%_]/g, (c) => '\\' + c)}%`

/** Keys table sort; `lastUsedAt` puts never-used keys last. */
export const credentialSort = (sort: string | undefined): KeysetSort => {
  const { field, descending } = parseSort<'name' | 'createdAt' | 'lastUsedAt'>(sort, 'name')
  if (field === 'name') return { expression: sql`lower(${vc.name})`, cast: 'text', descending }
  if (field === 'createdAt') return { expression: vc.createdAt, cast: 'timestamptz', descending }
  return {
    expression: sql`coalesce(${vc.lastUsedAt}, '-infinity'::timestamptz)`,
    cast: 'timestamptz',
    descending,
  }
}

export interface CredentialPageParams {
  limit: number
  sort: KeysetSort
  cursor?: KeysetCursor
  filters: Omit<ListCredentialsQuery, 'limit' | 'cursor' | 'sort'>
  /** Personal keys of other people are never listed in the organization's keys table. */
  excludePersonal: boolean
}

/** A key the gateway may use for one provider, in the resolution precedence. */
export interface ResolvableKey {
  id: string
  scope: CredentialScope
  teamId: string | null
  ownerUserId: string | null
  createdAt: Date
}

/**
 * `vault_credentials`. Every query filters by organization even though RLS does too. The secret
 * columns are read only by `findSecret`, inside the call path that needs the plain text.
 */
export class VaultRepository {
  /** A uuidv7 from Postgres: the row id is part of the secret's AAD, so it is known first. */
  async newId(tx: DbExecutor): Promise<string> {
    const result = await tx.execute<{ id: string }>(sql`select uuidv7() as id`)
    const id = result.rows[0]?.id
    if (id === undefined) throw new Error('uuidv7() returned no row')
    return id
  }

  async insert(tx: DbExecutor, values: NewCredentialRow): Promise<CredentialRow> {
    const [row] = await tx.insert(vc).values(values).returning()
    if (row === undefined) throw new Error('credential insert returned no row')
    return row
  }

  findById(tx: DbExecutor, orgId: string, id: string) {
    return tx.query.vaultCredentials.findFirst({
      where: and(eq(vc.organizationId, orgId), eq(vc.id, id)),
    })
  }

  /** The key that replaces each of `ids` (rotation step 1), for "Replaced by {name}". */
  async replacements(tx: DbExecutor, orgId: string, ids: readonly string[]) {
    if (ids.length === 0) return new Map<string, { id: string; name: string }>()
    const rows = await tx
      .select({ from: replacement.rotatedFromId, id: replacement.id, name: replacement.name })
      .from(replacement)
      .where(
        and(
          eq(replacement.organizationId, orgId),
          inArray(replacement.rotatedFromId, [...ids]),
          ne(replacement.status, 'revoked'),
        ),
      )
    return new Map(
      rows.flatMap((r) => (r.from === null ? [] : [[r.from, { id: r.id, name: r.name }]])),
    )
  }

  /** Models served by each local server. */
  async modelCounts(tx: DbExecutor, orgId: string, serverIds: readonly string[]) {
    if (serverIds.length === 0) return new Map<string, number>()
    const rows = await tx
      .select({ id: vaultModels.credentialId, n: count() })
      .from(vaultModels)
      .where(
        and(
          eq(vaultModels.organizationId, orgId),
          inArray(vaultModels.credentialId, [...serverIds]),
        ),
      )
      .groupBy(vaultModels.credentialId)
    return new Map(rows.flatMap((r) => (r.id === null ? [] : [[r.id, r.n]])))
  }

  listPage(tx: DbExecutor, orgId: string, page: CredentialPageParams) {
    const { filters } = page
    const conditions: (SQL | undefined)[] = [
      eq(vc.organizationId, orgId),
      page.excludePersonal ? ne(vc.scope, 'personal') : undefined,
      filters.q === undefined ? undefined : ilike(vc.name, likeTerm(filters.q)),
      filters.kind === undefined ? undefined : inArray(vc.kind, filters.kind),
      filters.scope === undefined ? undefined : inArray(vc.scope, filters.scope),
      filters.status === undefined ? undefined : inArray(vc.status, filters.status),
      filters.providerKey === undefined ? undefined : eq(vc.providerKey, filters.providerKey),
      filters.teamId === undefined ? undefined : eq(vc.teamId, filters.teamId),
      keysetAfter(page.sort, vc.id, page.cursor),
    ]
    return tx
      .select({ credential: vc, sortKey: keysetKey(page.sort) })
      .from(vc)
      .where(and(...conditions))
      .orderBy(...keysetOrder(page.sort, vc.id))
      .limit(page.limit + 1)
  }

  /** A person's own personal keys (Profile › API keys). */
  listPersonalPage(
    tx: DbExecutor,
    orgId: string,
    userId: string,
    page: { limit: number; sort: KeysetSort; cursor?: KeysetCursor },
  ) {
    return tx
      .select({ credential: vc, sortKey: keysetKey(page.sort) })
      .from(vc)
      .where(
        and(
          eq(vc.organizationId, orgId),
          eq(vc.scope, 'personal'),
          eq(vc.ownerUserId, userId),
          keysetAfter(page.sort, vc.id, page.cursor),
        ),
      )
      .orderBy(...keysetOrder(page.sort, vc.id))
      .limit(page.limit + 1)
  }

  /** Non-revoked AI keys and local servers, per provider: the provider cards. */
  providerSummaries(tx: DbExecutor, orgId: string) {
    return tx
      .select({
        providerKey: vc.providerKey,
        kind: vc.kind,
        keyCount: count(),
        activeCount: sql<number>`count(*) filter (where ${vc.status} = 'active')::int`,
        errorCount: sql<number>`count(*) filter (where ${vc.status} in ('error', 'expired'))::int`,
        rateLimitedCount: sql<number>`count(*) filter (where ${vc.status} = 'rate_limited')::int`,
        firstReason: sql<
          string | null
        >`(array_agg(${vc.statusReasonCode} order by ${vc.statusCheckedAt} desc nulls last) filter (where ${vc.statusReasonCode} is not null))[1]`,
        expiresAt: min(vc.expiresAt),
      })
      .from(vc)
      .where(
        and(
          eq(vc.organizationId, orgId),
          ne(vc.status, 'revoked'),
          inArray(vc.kind, ['ai_provider', 'local_server']),
          ne(vc.scope, 'personal'),
        ),
      )
      .groupBy(vc.providerKey, vc.kind)
  }

  /** A secret key already stored in the organization (fingerprint match), for the duplicate warning. */
  async findByFingerprint(tx: DbExecutor, orgId: string, fingerprint: string) {
    const [row] = await tx
      .select({ id: vc.id, name: vc.name })
      .from(vc)
      .where(
        and(
          eq(vc.organizationId, orgId),
          eq(vc.secretFingerprint, fingerprint),
          ne(vc.status, 'revoked'),
        ),
      )
      .limit(1)
    return row
  }

  /** Whether a primary, non-revoked AI key exists for this provider and scope. */
  async hasPrimary(
    tx: DbExecutor,
    orgId: string,
    key: {
      providerKey: string
      scope: CredentialScope
      teamId: string | null
      ownerUserId: string | null
    },
  ): Promise<boolean> {
    const [row] = await tx
      .select({ id: vc.id })
      .from(vc)
      .where(
        and(
          eq(vc.organizationId, orgId),
          eq(vc.kind, 'ai_provider'),
          eq(vc.providerKey, key.providerKey),
          eq(vc.scope, key.scope),
          key.teamId === null ? isNull(vc.teamId) : eq(vc.teamId, key.teamId),
          key.ownerUserId === null ? isNull(vc.ownerUserId) : eq(vc.ownerUserId, key.ownerUserId),
          eq(vc.isPrimary, true),
        ),
      )
      .limit(1)
    return row !== undefined
  }

  /**
   * The primary, non-revoked AI keys of a provider the caller could use: personal (theirs), team
   * (their teams) and organization. The service orders them by precedence.
   */
  resolvableKeys(
    tx: DbExecutor,
    orgId: string,
    input: { providerKey: string; userId: string | null; teamIds: readonly string[] },
  ): Promise<ResolvableKey[]> {
    return tx
      .select({
        id: vc.id,
        scope: sql<CredentialScope>`${vc.scope}`,
        teamId: vc.teamId,
        ownerUserId: vc.ownerUserId,
        createdAt: vc.createdAt,
      })
      .from(vc)
      .where(
        and(
          eq(vc.organizationId, orgId),
          eq(vc.kind, 'ai_provider'),
          eq(vc.providerKey, input.providerKey),
          eq(vc.isPrimary, true),
          ne(vc.status, 'revoked'),
          or(
            eq(vc.scope, 'organization'),
            input.teamIds.length === 0
              ? undefined
              : and(eq(vc.scope, 'team'), inArray(vc.teamId, [...input.teamIds])),
            input.userId === null
              ? undefined
              : and(eq(vc.scope, 'personal'), eq(vc.ownerUserId, input.userId)),
          ),
        ),
      )
      .orderBy(asc(vc.createdAt))
  }

  /** The secret columns of one key: only for the call path that decrypts it. */
  async findSecret(tx: DbExecutor, orgId: string, id: string) {
    const [row] = await tx
      .select({
        id: vc.id,
        kind: vc.kind,
        providerKey: vc.providerKey,
        baseUrl: vc.baseUrl,
        status: vc.status,
        secretCiphertext: vc.secretCiphertext,
        secretIv: vc.secretIv,
        secretAuthTag: vc.secretAuthTag,
        dataKeyVersion: vc.dataKeyVersion,
      })
      .from(vc)
      .where(and(eq(vc.organizationId, orgId), eq(vc.id, id)))
    return row
  }

  async update(
    tx: DbExecutor,
    orgId: string,
    id: string,
    patch: Partial<Omit<NewCredentialRow, 'id' | 'organizationId'>>,
  ): Promise<CredentialRow | undefined> {
    const [row] = await tx
      .update(vc)
      .set(patch)
      .where(and(eq(vc.organizationId, orgId), eq(vc.id, id)))
      .returning()
    return row
  }

  /** Rotation step 2: the replacement takes traffic, the old key stays active and unused. */
  async switchPrimary(tx: DbExecutor, orgId: string, oldId: string, newId: string): Promise<void> {
    await tx
      .update(vc)
      .set({ isPrimary: false })
      .where(and(eq(vc.organizationId, orgId), eq(vc.id, oldId)))
    await tx
      .update(vc)
      .set({ isPrimary: true })
      .where(and(eq(vc.organizationId, orgId), eq(vc.id, newId)))
  }

  /** Nulls the secret in the same statement that marks the key revoked; last4 and fingerprint stay. */
  async revoke(tx: DbExecutor, orgId: string, id: string, userId: string | null) {
    const [row] = await tx
      .update(vc)
      .set({
        status: 'revoked',
        isPrimary: false,
        revokedAt: sql`current_timestamp`,
        revokedByUserId: userId,
        secretCiphertext: null,
        secretIv: null,
        secretAuthTag: null,
        dataKeyVersion: null,
      })
      .where(and(eq(vc.organizationId, orgId), eq(vc.id, id), ne(vc.status, 'revoked')))
      .returning()
    return row
  }

  /** A person leaves: their personal keys are revoked with their secrets, in the removal transaction. */
  async revokePersonalKeys(
    tx: DbExecutor,
    orgId: string,
    userId: string,
    revokedBy: string | null,
  ) {
    return tx
      .update(vc)
      .set({
        status: 'revoked',
        isPrimary: false,
        revokedAt: sql`current_timestamp`,
        revokedByUserId: revokedBy,
        secretCiphertext: null,
        secretIv: null,
        secretAuthTag: null,
        dataKeyVersion: null,
      })
      .where(
        and(
          eq(vc.organizationId, orgId),
          eq(vc.scope, 'personal'),
          eq(vc.ownerUserId, userId),
          ne(vc.status, 'revoked'),
        ),
      )
      .returning({ id: vc.id, providerKey: vc.providerKey })
  }

  /** A gateway call or a test changed the key's health. */
  async setStatus(
    tx: DbExecutor,
    orgId: string,
    id: string,
    status: Exclude<CredentialStatus, 'revoked'>,
    reasonCode: string | null,
    succeeded: boolean,
  ): Promise<void> {
    await tx
      .update(vc)
      .set({
        status,
        statusReasonCode: reasonCode,
        statusCheckedAt: sql`current_timestamp`,
        ...(succeeded ? { lastSuccessAt: sql`current_timestamp` } : {}),
      })
      .where(and(eq(vc.organizationId, orgId), eq(vc.id, id), ne(vc.status, 'revoked')))
  }

  async touchLastUsed(tx: DbExecutor, orgId: string, id: string): Promise<void> {
    await tx
      .update(vc)
      .set({ lastUsedAt: sql`current_timestamp` })
      .where(and(eq(vc.organizationId, orgId), eq(vc.id, id)))
  }

  async delete(tx: DbExecutor, orgId: string, id: string): Promise<void> {
    await tx.delete(vc).where(and(eq(vc.organizationId, orgId), eq(vc.id, id)))
  }

  /** Non-revoked keys and servers of the given kinds (the daily sync). */
  listActiveCredentials(tx: DbExecutor, orgId: string, kinds: readonly CredentialKind[]) {
    return tx
      .select()
      .from(vc)
      .where(
        and(eq(vc.organizationId, orgId), inArray(vc.kind, [...kinds]), ne(vc.status, 'revoked')),
      )
  }
}
