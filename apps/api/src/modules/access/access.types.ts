// SPDX-License-Identifier: AGPL-3.0-only
import type { TeamRefDto, UserRefDto } from '@surefy/contracts'

import type { DbExecutor } from '@/core/database/index.js'
import type { OrganizationAccessHeader } from '@/modules/organizations/index.js'

/** What the service needs from the request: the verified organization and who acts. */
export interface AccessContext {
  orgId: string
  userId: string | null
}

/** The organizations module's per-request header and access version bump. */
export interface AccessOrganizations {
  findAccessHeaderInTx(tx: DbExecutor, orgId: string): Promise<OrganizationAccessHeader | undefined>
  bumpAccessVersionInTx(tx: DbExecutor, orgId: string): Promise<void>
}

/** The teams module's team references (existence and names). */
export interface AccessTeams {
  findRefsInTx(tx: DbExecutor, orgId: string, teamIds: readonly string[]): Promise<TeamRefDto[]>
}

/** Display data and the two-factor flag of people, from the module that owns `users`. */
export interface AccessUsers {
  findUserRefs(userIds: readonly string[]): Promise<ReadonlyMap<string, UserRefDto>>
  findById(userId: string): Promise<{ twoFactorEnabled: boolean } | undefined>
}

/**
 * The models a person may call (`allowedModelIds`): Vault models with a matching access rule.
 * The vault module provides it; until then nobody has models.
 */
export interface AccessModels {
  allowedFor(
    tx: DbExecutor,
    input: {
      orgId: string
      userId: string | null
      teamIds: readonly string[]
      providersAllowed: readonly string[] | null
    },
  ): Promise<string[]>
}
