// SPDX-License-Identifier: AGPL-3.0-only
import { and, eq, inArray, isNull, or, sql } from 'drizzle-orm'

import { accessPolicies } from '@/database/tables/index.js'
import type { AccessPolicy, MemberStatus, OrgRole } from '@surefy/contracts'

import type { DbExecutor } from '@/core/database/index.js'

export type AccessPolicyRow = typeof accessPolicies.$inferSelect

/** A membership as effective access needs it: role, status, primary team and teams. */
export interface MemberForAccess {
  role: OrgRole
  status: MemberStatus
  primaryTeamId: string | null
  /** Earliest joined first. */
  teamIds: string[]
}

/**
 * `access_policies`, plus the read-only membership query effective access runs on every cache
 * miss (organization_members_organization_id_user_id_key, team_members_organization_id_user_id_idx).
 */
export class AccessRepository {
  /** Membership, primary team and teams in one round trip. */
  async findMemberForAccess(
    tx: DbExecutor,
    orgId: string,
    userId: string,
  ): Promise<MemberForAccess | undefined> {
    const result = await tx.execute<{
      role: OrgRole
      status: MemberStatus
      primary_team_id: string | null
      team_ids: string[]
    }>(sql`
      select m.role, m.status, m.primary_team_id,
        coalesce(array_agg(tm.team_id order by tm.created_at, tm.team_id)
          filter (where tm.team_id is not null), '{}') as team_ids
      from organization_members m
      left join team_members tm on tm.organization_id = m.organization_id and tm.user_id = m.user_id
      where m.organization_id = ${orgId} and m.user_id = ${userId}
      group by m.id`)
    const row = result.rows[0]
    if (row === undefined) return undefined
    return {
      role: row.role,
      status: row.status,
      primaryTeamId: row.primary_team_id,
      teamIds: row.team_ids,
    }
  }

  /** The organization row and the rows of the given teams. */
  listForOrgAndTeams(
    tx: DbExecutor,
    orgId: string,
    teamIds: readonly string[],
  ): Promise<AccessPolicyRow[]> {
    const levels =
      teamIds.length === 0
        ? isNull(accessPolicies.teamId)
        : or(isNull(accessPolicies.teamId), inArray(accessPolicies.teamId, [...teamIds]))
    return tx
      .select()
      .from(accessPolicies)
      .where(and(eq(accessPolicies.organizationId, orgId), levels))
  }

  async find(
    tx: DbExecutor,
    orgId: string,
    teamId: string | null,
  ): Promise<AccessPolicyRow | undefined> {
    const [row] = await tx
      .select()
      .from(accessPolicies)
      .where(
        and(
          eq(accessPolicies.organizationId, orgId),
          teamId === null ? isNull(accessPolicies.teamId) : eq(accessPolicies.teamId, teamId),
        ),
      )
    return row
  }

  /** Upsert on `(organization_id, team_id)`; the whole document is replaced. */
  async upsert(
    tx: DbExecutor,
    values: {
      organizationId: string
      teamId: string | null
      policy: AccessPolicy
      userId: string | null
    },
  ): Promise<AccessPolicyRow> {
    const [row] = await tx
      .insert(accessPolicies)
      .values({
        organizationId: values.organizationId,
        teamId: values.teamId,
        policy: values.policy,
        updatedByUserId: values.userId,
      })
      .onConflictDoUpdate({
        target: [accessPolicies.organizationId, accessPolicies.teamId],
        set: { policy: values.policy, updatedByUserId: values.userId, updatedAt: new Date() },
      })
      .returning()
    if (row === undefined) throw new Error('access policy upsert returned no row')
    return row
  }
}
