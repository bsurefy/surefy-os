// SPDX-License-Identifier: AGPL-3.0-only
import type { TeamDto, TeamMemberDto, TeamRefDto, UserRefDto } from '@surefy/contracts'

import type { TeamRow } from './teams.repository.js'

export function toTeamDto(
  row: TeamRow,
  counts: { memberCount: number; primaryMemberCount: number },
): TeamDto {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    leadUserId: row.leadUserId,
    memberCount: counts.memberCount,
    primaryMemberCount: counts.primaryMemberCount,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

export const toTeamRefDto = (row: { id: string; name: string }): TeamRefDto => ({
  id: row.id,
  name: row.name,
})

export function toTeamMemberDto(
  row: { userId: string; addedAt: Date; role: TeamMemberDto['role']; primaryTeamId: string | null },
  team: TeamRow,
  user: UserRefDto,
): TeamMemberDto {
  return {
    user,
    role: row.role,
    isLead: team.leadUserId === row.userId,
    isPrimary: row.primaryTeamId === team.id,
    addedAt: row.addedAt.toISOString(),
  }
}
