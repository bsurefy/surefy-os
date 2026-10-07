// SPDX-License-Identifier: AGPL-3.0-only
import { and, asc, eq, ilike, inArray, lte, or, sql, type SQL } from 'drizzle-orm'

import { invitations, invitationTeams } from '@/database/tables/index.js'
import {
  keysetAfter,
  keysetKey,
  keysetOrder,
  type KeysetCursor,
  type KeysetSort,
} from '@/lib/pagination.js'
import type { InvitationDeliveryStatus, InvitationStatus, OrgRole } from '@surefy/contracts'

import { INVITATION_TTL_DAYS } from '../members.constants.js'

import type { DbExecutor } from '@/core/database/index.js'

export type InvitationRow = typeof invitations.$inferSelect
export type NewInvitationRow = typeof invitations.$inferInsert

/** What `invitation_resolve_token` returns for a link (any status, active organizations only). */
export interface ResolvedInvitation {
  invitationId: string
  organizationId: string
  organizationName: string
  organizationSlug: string
  organizationLogoObjectKey: string | null
  email: string
  role: OrgRole
  status: InvitationStatus
  expiresAt: Date
  invitedByName: string | null
}

export interface PendingInvitationForEmail {
  invitationId: string
  organizationId: string
  organizationName: string
  organizationSlug: string
  role: OrgRole
  expiresAt: Date
  invitedByName: string | null
}

export interface InvitationPageParams {
  limit: number
  cursor?: KeysetCursor
  q?: string
  /** Computed statuses: a pending row past `expires_at` counts as expired. */
  statuses: readonly InvitationStatus[]
}

const i = invitations

/** Pending invitations newest first (`invitations_organization_id_created_at_id_idx`). */
export const INVITATION_SORT: KeysetSort = {
  expression: i.createdAt,
  cast: 'timestamptz',
  descending: true,
}

const likeTerm = (q: string): string => {
  const escaped = q.replaceAll(/[\\%_]/g, (c) => '\\' + c)
  return `%${escaped}%`
}

/** Readers never trust the stored status alone: expiry is computed. */
const statusCondition = (status: InvitationStatus): SQL | undefined => {
  if (status === 'pending') return sql`(${i.status} = 'pending' and ${i.expiresAt} > now())`
  if (status === 'expired') {
    return sql`(${i.status} = 'expired' or (${i.status} = 'pending' and ${i.expiresAt} <= now()))`
  }
  return eq(i.status, status)
}

const newExpiry = () => sql`now() + make_interval(days => ${INVITATION_TTL_DAYS})`

/**
 * `invitations` and `invitation_teams`, filtered by organization even though RLS does too. The
 * link and the sign-up policy resolve through definer functions before the tenant is known.
 */
export class MemberInvitationsRepository {
  async insert(tx: DbExecutor, values: NewInvitationRow): Promise<InvitationRow> {
    const [row] = await tx.insert(i).values(values).returning()
    if (row === undefined) throw new Error('invitation insert returned no row')
    return row
  }

  async insertTeams(
    tx: DbExecutor,
    orgId: string,
    invitationId: string,
    teamIds: readonly string[],
  ): Promise<void> {
    if (teamIds.length === 0) return
    await tx.insert(invitationTeams).values(
      teamIds.map((teamId, position) => ({
        organizationId: orgId,
        invitationId,
        teamId,
        position,
      })),
    )
  }

  findById(tx: DbExecutor, orgId: string, invitationId: string) {
    return tx.query.invitations.findFirst({
      where: and(eq(i.organizationId, orgId), eq(i.id, invitationId)),
    })
  }

  /** The stored-pending invitation for an address (expired by time or not). */
  findPendingByEmail(tx: DbExecutor, orgId: string, email: string) {
    return tx.query.invitations.findFirst({
      where: and(eq(i.organizationId, orgId), eq(i.email, email), eq(i.status, 'pending')),
    })
  }

  async listPage(tx: DbExecutor, orgId: string, page: InvitationPageParams) {
    return tx
      .select({ invitation: i, sortKey: keysetKey(INVITATION_SORT) })
      .from(i)
      .where(
        and(
          eq(i.organizationId, orgId),
          or(...page.statuses.map(statusCondition)),
          page.q === undefined ? undefined : ilike(i.email, likeTerm(page.q)),
          keysetAfter(INVITATION_SORT, i.id, page.cursor),
        ),
      )
      .orderBy(...keysetOrder(INVITATION_SORT, i.id))
      .limit(page.limit + 1)
  }

  /** Team ids of several invitations, in the order chosen in the invite dialog. */
  listTeamIds(tx: DbExecutor, orgId: string, invitationIds: readonly string[]) {
    if (invitationIds.length === 0) return Promise.resolve([])
    return tx
      .select({ invitationId: invitationTeams.invitationId, teamId: invitationTeams.teamId })
      .from(invitationTeams)
      .where(
        and(
          eq(invitationTeams.organizationId, orgId),
          inArray(invitationTeams.invitationId, [...invitationIds]),
        ),
      )
      .orderBy(asc(invitationTeams.position), asc(invitationTeams.teamId))
  }

  /** Frees the one-pending-per-address index from a pending row whose time has passed. */
  async markExpired(tx: DbExecutor, orgId: string, invitationId: string): Promise<void> {
    await tx
      .update(i)
      .set({ status: 'expired' })
      .where(
        and(
          eq(i.organizationId, orgId),
          eq(i.id, invitationId),
          eq(i.status, 'pending'),
          lte(i.expiresAt, sql`now()`),
        ),
      )
  }

  /**
   * Resend and Copy invite link: a new token, a fresh expiry; Resend also counts a send and
   * queues the email again.
   */
  async rotateToken(
    tx: DbExecutor,
    orgId: string,
    invitationId: string,
    tokenHash: Buffer,
    options: { resend: boolean },
  ) {
    const [row] = await tx
      .update(i)
      .set({
        tokenHash,
        expiresAt: newExpiry(),
        ...(options.resend
          ? { sendCount: sql`${i.sendCount} + 1`, deliveryStatus: 'queued' as const }
          : {}),
      })
      .where(and(eq(i.organizationId, orgId), eq(i.id, invitationId), eq(i.status, 'pending')))
      .returning()
    return row
  }

  async revoke(tx: DbExecutor, orgId: string, invitationId: string, byUserId: string | null) {
    const [row] = await tx
      .update(i)
      .set({ status: 'revoked', revokedAt: sql`now()`, revokedByUserId: byUserId })
      .where(and(eq(i.organizationId, orgId), eq(i.id, invitationId), eq(i.status, 'pending')))
      .returning()
    return row
  }

  /** Zero rows when the invitation expired or was revoked meanwhile. */
  async accept(tx: DbExecutor, orgId: string, invitationId: string, userId: string) {
    const [row] = await tx
      .update(i)
      .set({ status: 'accepted', acceptedAt: sql`now()`, acceptedUserId: userId })
      .where(
        and(
          eq(i.organizationId, orgId),
          eq(i.id, invitationId),
          eq(i.status, 'pending'),
          sql`${i.expiresAt} > now()`,
        ),
      )
      .returning()
    return row
  }

  /** The email job's outcome; `sent` also records when the mailer took it. */
  async setDeliveryStatus(
    tx: DbExecutor,
    orgId: string,
    invitationId: string,
    status: InvitationDeliveryStatus,
  ): Promise<void> {
    await tx
      .update(i)
      .set({ deliveryStatus: status, ...(status === 'sent' ? { lastSentAt: sql`now()` } : {}) })
      .where(and(eq(i.organizationId, orgId), eq(i.id, invitationId)))
  }

  /** Definer `invitation_resolve_token`. */
  async resolveToken(
    executor: DbExecutor,
    tokenHash: Buffer,
  ): Promise<ResolvedInvitation | undefined> {
    const result = await executor.execute<{
      invitation_id: string
      organization_id: string
      organization_name: string
      organization_slug: string
      organization_logo_object_key: string | null
      email: string
      role: OrgRole
      status: InvitationStatus
      expires_at: Date | string
      invited_by_name: string | null
    }>(sql`select * from invitation_resolve_token(${tokenHash})`)
    const row = result.rows[0]
    if (row === undefined) return undefined
    return {
      invitationId: row.invitation_id,
      organizationId: row.organization_id,
      organizationName: row.organization_name,
      organizationSlug: row.organization_slug,
      organizationLogoObjectKey: row.organization_logo_object_key,
      email: row.email,
      role: row.role,
      status: row.status,
      expiresAt: new Date(row.expires_at),
      invitedByName: row.invited_by_name,
    }
  }

  /** Definer `invitation_list_for_email`: only for a verified address. */
  async listPendingForEmail(
    executor: DbExecutor,
    email: string,
  ): Promise<PendingInvitationForEmail[]> {
    const result = await executor.execute<{
      invitation_id: string
      organization_id: string
      organization_name: string
      organization_slug: string
      role: OrgRole
      expires_at: Date | string
      invited_by_name: string | null
    }>(sql`select * from invitation_list_for_email(${email})`)
    return result.rows.map((row) => ({
      invitationId: row.invitation_id,
      organizationId: row.organization_id,
      organizationName: row.organization_name,
      organizationSlug: row.organization_slug,
      role: row.role,
      expiresAt: new Date(row.expires_at),
      invitedByName: row.invited_by_name,
    }))
  }

  /** Definer `invitation_pending_for_email`: the sign-up policy's question. */
  async hasPendingForEmail(executor: DbExecutor, email: string): Promise<boolean> {
    const result = await executor.execute<{ pending: boolean }>(
      sql`select invitation_pending_for_email(${email}) as pending`,
    )
    return result.rows[0]?.pending === true
  }
}
