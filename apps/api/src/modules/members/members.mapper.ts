// SPDX-License-Identifier: AGPL-3.0-only
import type { MemberDto, TeamRefDto } from '@surefy/contracts'

import type { MembershipRow } from './memberships/memberships.repository.js'
import type { MemberProfile } from '@/modules/auth/index.js'

export function toMemberDto(
  row: MembershipRow,
  profile: MemberProfile,
  teams: readonly TeamRefDto[],
): MemberDto {
  return {
    id: row.id,
    user: profile.user,
    role: row.role,
    status: row.status,
    primaryTeamId: row.primaryTeamId,
    teams: [...teams],
    signInMethod: profile.signInMethod,
    twoFactorEnabled: profile.twoFactorEnabled,
    provisioningSource: row.provisioningSource,
    lastActiveAt: row.lastActiveAt?.toISOString() ?? null,
    joinedAt: row.joinedAt.toISOString(),
    invitedByUserId: row.invitedByUserId,
    deactivatedAt: row.deactivatedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}
