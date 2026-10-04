// SPDX-License-Identifier: AGPL-3.0-only
import { COMMUNITY_ENTITLEMENTS, ROLE_PERMISSIONS, roleAtLeast } from '@surefy/contracts'

import { OrganizationSuspendedError } from '../members.errors.js'

import type { MemberOrganizations, MemberTeams } from '../members.types.js'
import type { MembershipsRepository } from '../memberships/memberships.repository.js'
import type { Database } from '@/core/database/index.js'
import type { TenantAccessResolver } from '@/plugins/access.plugin.js'
import type { ActorContext, EffectiveAccess } from '@/types/context.js'

export interface MemberAccessDeps {
  db: Database
  membershipsRepository: MembershipsRepository
  organizations: Pick<MemberOrganizations, 'findStatusInTx'>
  teams: Pick<MemberTeams, 'listTeamIdsForUserInTx'>
}

/**
 * Membership-based access for `app.authorize()` until the access module computes effective
 * access (B2-05 replaces it in the container). It loads `(role, status, primary_team_id)` by
 * `organization_members_organization_id_user_id_key` under `db.tenant`: no row or a deactivated
 * one answers 404, a suspended organization 403, and while deletion is scheduled only Owners and
 * Admins keep access. Permissions are the role's defaults under the Community entitlements.
 */
export class MemberAccessResolver implements TenantAccessResolver {
  constructor(private readonly deps: MemberAccessDeps) {}

  async resolve(actor: ActorContext, orgId: string): Promise<EffectiveAccess | null> {
    const { userId } = actor
    if (userId === null) return null // API keys and access grants arrive with the access module
    const state = await this.deps.db.tenant(orgId, async (tx) => {
      const membership = await this.deps.membershipsRepository.findByUser(tx, orgId, userId)
      if (membership?.status !== 'active') return null
      const status = await this.deps.organizations.findStatusInTx(tx, orgId)
      if (status === undefined) return null
      const teamIds = await this.deps.teams.listTeamIdsForUserInTx(tx, orgId, userId)
      return { membership, status, teamIds }
    })
    if (state === null) return null
    const { membership, status, teamIds } = state
    if (status === 'suspended') throw new OrganizationSuspendedError()
    if (status === 'deletion_scheduled' && !roleAtLeast(membership.role, 'admin')) return null
    return {
      role: membership.role,
      teamIds,
      primaryTeamId: membership.primaryTeamId,
      permissions: [...ROLE_PERMISSIONS[membership.role]],
      modules: [...COMMUNITY_ENTITLEMENTS.modules],
      features: [],
      readOnlyFeatures: [],
      license: null,
      allowedModelIds: 'all',
      limits: {
        monthlySpendMicros: null,
        maxAgents: null,
        maxFlows: null,
        maxRunsPerMonth: null,
        maxStorageBytes: null,
        maxKnowledgeBases: null,
      },
      reasons: [],
    }
  }
}
