// SPDX-License-Identifier: AGPL-3.0-only
import { and, asc, eq, gt, gte, ilike, inArray, isNotNull, lt, or, sql } from 'drizzle-orm'

import {
  auditChainHeads,
  auditLogs,
  invitations,
  organizationMembers,
  organizations,
  teams,
  userPreferences,
  users,
} from '@/database/tables/index.js'
import {
  keysetAfter,
  keysetKey,
  keysetOrder,
  type KeysetCursor,
  type KeysetSort,
} from '@/lib/pagination.js'
import type { ListAuditEntriesQuery } from '@surefy/contracts'

import type { DbExecutor } from '@/core/database/index.js'

export type AuditLogRow = typeof auditLogs.$inferSelect
export type NewAuditLogRow = typeof auditLogs.$inferInsert
export type AuditChainHeadRow = typeof auditChainHeads.$inferSelect

export type AuditEntryFilters = Omit<ListAuditEntriesQuery, 'limit' | 'cursor'>

/** The log reads newest first (audit_logs_organization_id_created_at_idx). */
export const AUDIT_SORT: KeysetSort = {
  expression: auditLogs.createdAt,
  cast: 'timestamptz',
  descending: true,
}

/** Escapes `%`, `_` and `\` so a search term matches literally. */
const likeTerm = (q: string): string => `%${q.replaceAll(/[\\%_]/g, (c) => '\\' + c)}%`

const filterConditions = (filters: AuditEntryFilters) => [
  filters.q === undefined
    ? undefined
    : or(
        ilike(auditLogs.action, likeTerm(filters.q)),
        ilike(auditLogs.targetType, likeTerm(filters.q)),
        ilike(auditLogs.reason, likeTerm(filters.q)),
        eq(auditLogs.requestId, filters.q),
      ),
  filters.actorType === undefined ? undefined : inArray(auditLogs.actorType, filters.actorType),
  filters.actorUserId === undefined ? undefined : eq(auditLogs.actorUserId, filters.actorUserId),
  filters.action === undefined ? undefined : inArray(auditLogs.action, filters.action),
  filters.targetType === undefined ? undefined : eq(auditLogs.targetType, filters.targetType),
  filters.targetId === undefined ? undefined : eq(auditLogs.targetId, filters.targetId),
  filters.outcome === undefined ? undefined : inArray(auditLogs.outcome, filters.outcome),
  filters.from === undefined ? undefined : gte(auditLogs.createdAt, new Date(filters.from)),
  filters.to === undefined ? undefined : lt(auditLogs.createdAt, new Date(filters.to)),
]

/**
 * `audit_logs` (append-only: insert and read) and `audit_chain_heads` (read). Sealing and
 * partition upkeep go through the definer functions.
 */
export class AuditRepository {
  async insert(tx: DbExecutor, row: NewAuditLogRow): Promise<void> {
    await tx.insert(auditLogs).values(row)
  }

  listPage(
    tx: DbExecutor,
    orgId: string,
    filters: AuditEntryFilters,
    page: { limit: number; cursor?: KeysetCursor },
  ) {
    return tx
      .select({ entry: auditLogs, sortKey: keysetKey(AUDIT_SORT) })
      .from(auditLogs)
      .where(
        and(
          eq(auditLogs.organizationId, orgId),
          ...filterConditions(filters),
          keysetAfter(AUDIT_SORT, auditLogs.id, page.cursor),
        ),
      )
      .orderBy(...keysetOrder(AUDIT_SORT, auditLogs.id))
      .limit(page.limit + 1)
  }

  async findById(tx: DbExecutor, orgId: string, id: string): Promise<AuditLogRow | undefined> {
    const [row] = await tx
      .select()
      .from(auditLogs)
      .where(and(eq(auditLogs.organizationId, orgId), eq(auditLogs.id, id)))
      .limit(1)
    return row
  }

  async findChainHead(tx: DbExecutor, orgId: string): Promise<AuditChainHeadRow | undefined> {
    const [row] = await tx
      .select()
      .from(auditChainHeads)
      .where(eq(auditChainHeads.organizationId, orgId))
    return row
  }

  async counts(tx: DbExecutor, orgId: string): Promise<{ sealed: number; unsealed: number }> {
    const [row] = await tx
      .select({
        sealed: sql<number>`count(*) filter (where ${auditLogs.chainSeq} is not null)::integer`,
        unsealed: sql<number>`count(*) filter (where ${auditLogs.chainSeq} is null)::integer`,
      })
      .from(auditLogs)
      .where(eq(auditLogs.organizationId, orgId))
    return row ?? { sealed: 0, unsealed: 0 }
  }

  /** The next sealed rows of the chain, by position (audit_logs_organization_id_chain_seq_idx). */
  listSealedAfter(tx: DbExecutor, orgId: string, afterSeq: number, limit: number) {
    return tx
      .select()
      .from(auditLogs)
      .where(
        and(
          eq(auditLogs.organizationId, orgId),
          isNotNull(auditLogs.chainSeq),
          gt(auditLogs.chainSeq, afterSeq),
        ),
      )
      .orderBy(asc(auditLogs.chainSeq))
      .limit(limit)
  }

  /**
   * Display labels of the targets the identity modules write, as read-only lookups at read time
   * (names are never stored in the log). Keyed by `<type>:<id>`; unknown or deleted targets are
   * left out.
   */
  async findTargetLabels(
    tx: DbExecutor,
    orgId: string,
    targets: readonly { type: string; id: string }[],
  ): Promise<Map<string, string>> {
    const idsOf = (type: string) => [
      ...new Set(targets.filter((t) => t.type === type).map((t) => t.id)),
    ]
    const labels = new Map<string, string>()
    const put = (type: string, rows: readonly { id: string; label: string | null }[]) => {
      for (const row of rows) if (row.label !== null) labels.set(`${type}:${row.id}`, row.label)
    }
    const memberIds = idsOf('member')
    if (memberIds.length > 0) {
      put(
        'member',
        await tx
          .select({ id: organizationMembers.id, label: users.name })
          .from(organizationMembers)
          .innerJoin(users, eq(users.id, organizationMembers.userId))
          .where(
            and(
              eq(organizationMembers.organizationId, orgId),
              inArray(organizationMembers.id, memberIds),
            ),
          ),
      )
    }
    const teamIds = idsOf('team')
    if (teamIds.length > 0) {
      put(
        'team',
        await tx
          .select({ id: teams.id, label: teams.name })
          .from(teams)
          .where(and(eq(teams.organizationId, orgId), inArray(teams.id, teamIds))),
      )
    }
    const invitationIds = idsOf('invitation')
    if (invitationIds.length > 0) {
      put(
        'invitation',
        await tx
          .select({ id: invitations.id, label: invitations.email })
          .from(invitations)
          .where(
            and(eq(invitations.organizationId, orgId), inArray(invitations.id, invitationIds)),
          ),
      )
    }
    if (targets.some((t) => t.type === 'organization')) {
      put(
        'organization',
        await tx
          .select({ id: organizations.id, label: organizations.name })
          .from(organizations)
          .where(eq(organizations.id, orgId)),
      )
    }
    return labels
  }

  /** The person's last organization (`user_preferences`, read under `db.user`). */
  async findLastOrganizationId(tx: DbExecutor, userId: string): Promise<string | null> {
    const [row] = await tx
      .select({ orgId: userPreferences.lastOrganizationId })
      .from(userPreferences)
      .where(eq(userPreferences.userId, userId))
    return row?.orgId ?? null
  }

  /** Whether the person is an active member of the organization (read under `db.user`). */
  async isActiveMember(tx: DbExecutor, orgId: string, userId: string): Promise<boolean> {
    const [row] = await tx
      .select({ id: organizationMembers.id })
      .from(organizationMembers)
      .where(
        and(
          eq(organizationMembers.organizationId, orgId),
          eq(organizationMembers.userId, userId),
          eq(organizationMembers.status, 'active'),
        ),
      )
    return row !== undefined
  }

  /** `audit_seal(limit)`: seals new rows of every organization; returns how many. */
  async seal(executor: DbExecutor, limit: number): Promise<number> {
    const result = await executor.execute<{ sealed: number }>(
      sql`select audit_seal(${limit}::integer) as sealed`,
    )
    return result.rows[0]?.sealed ?? 0
  }

  /** Organizations with a chain, for the nightly verification (system scope). */
  async listChainOrganizationIds(tx: DbExecutor): Promise<string[]> {
    const rows = await tx
      .select({ orgId: auditChainHeads.organizationId })
      .from(auditChainHeads)
      .orderBy(asc(auditChainHeads.organizationId))
    return rows.map((row) => row.orgId)
  }
}
