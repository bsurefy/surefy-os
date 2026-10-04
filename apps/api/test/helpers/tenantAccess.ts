// SPDX-License-Identifier: AGPL-3.0-only
import { ROLE_PERMISSIONS, type OrgRole } from '@surefy/contracts'

import type { TenantAccessResolver } from '@/plugins/access.plugin.js'
import type { EffectiveAccess } from '@/types/context.js'

/** A stand-in for memberships: who belongs to which organization, with which role. */
export interface TestTenants extends TenantAccessResolver {
  /** Makes `userId` an active member of `orgId` with the role's default permissions. */
  grant(orgId: string, userId: string, role?: OrgRole, access?: Partial<EffectiveAccess>): void
}

/**
 * Memberships for route tests until the members and access modules provide the real resolver
 * (`createTestApp({ tenants })`). Unknown pairs have no access: `404 ORGANIZATION_NOT_FOUND`.
 */
export function createTestTenants(): TestTenants {
  const memberships = new Map<string, EffectiveAccess>()
  const keyOf = (orgId: string, userId: string) => `${orgId}:${userId}`
  return {
    grant(orgId, userId, role = 'user', access = {}) {
      memberships.set(keyOf(orgId, userId), {
        role,
        teamIds: [],
        primaryTeamId: null,
        permissions: [...ROLE_PERMISSIONS[role]],
        modules: [],
        features: [],
        readOnlyFeatures: [],
        license: null,
        allowedModelIds: [],
        limits: {
          monthlySpendMicros: null,
          maxAgents: null,
          maxFlows: null,
          maxRunsPerMonth: null,
          maxStorageBytes: null,
          maxKnowledgeBases: null,
        },
        reasons: [],
        ...access,
      })
    },
    resolve(actor, orgId) {
      if (actor.userId === null) return Promise.resolve(null)
      return Promise.resolve(memberships.get(keyOf(orgId, actor.userId)) ?? null)
    },
  }
}
