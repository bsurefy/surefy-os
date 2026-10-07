// SPDX-License-Identifier: AGPL-3.0-only
import type { CredentialSpendDto, TeamRefDto, UserRefDto } from '@surefy/contracts'

import type { DbExecutor } from '@/core/database/index.js'
import type { ProviderRules } from '@/modules/access/index.js'
import type { TenantContext } from '@/types/context.js'

/** What the services need from the request: the verified organization, who acts, their teams. */
export type VaultContext = Pick<
  TenantContext,
  'orgId' | 'userId' | 'teamIds' | 'via' | 'requestId' | 'ip' | 'userAgent' | 'apiKey' | 'grantId'
>

/** The access chain's provider rules (access module). */
export interface VaultAccess {
  providerRules(
    orgId: string,
    subject: { userId: string } | { teamId: string } | null,
  ): Promise<ProviderRules>
}

/** Team names, and whether a team exists in the organization (teams module). */
export interface VaultTeams {
  findRefsInTx(tx: DbExecutor, orgId: string, teamIds: readonly string[]): Promise<TeamRefDto[]>
}

/** People's display data (auth module). */
export interface VaultUserRefs {
  findUserRefs(userIds: readonly string[]): Promise<ReadonlyMap<string, UserRefDto>>
}

/** Bumps `organizations.access_version` when model access changes (organizations module). */
export interface VaultOrganizations {
  bumpAccessVersionInTx(tx: DbExecutor, orgId: string): Promise<void>
}

/**
 * Usage behind the keys table and the impact dialogs: spend this month per key and the people who
 * used it. The usage module provides it; until then keys show no spend and no users.
 */
export interface VaultUsage {
  spendThisMonth(
    tx: DbExecutor,
    orgId: string,
    credentialIds: readonly string[],
  ): Promise<ReadonlyMap<string, CredentialSpendDto[]>>
  usersThisMonth(tx: DbExecutor, orgId: string, credentialId: string): Promise<number>
}

export const NO_USAGE: VaultUsage = {
  spendThisMonth: () => Promise.resolve(new Map()),
  usersThisMonth: () => Promise.resolve(0),
}
