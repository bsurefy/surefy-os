// SPDX-License-Identifier: AGPL-3.0-only
import type { MemberDto, TeamDeletionImpactDto, TeamDto } from '@surefy/contracts'

/** Maps a person's id to their name, for the lead column. */
export function indexNamesByUserId(members: MemberDto[]): Map<string, string> {
  return new Map(members.map((member) => [member.user.id, member.user.name]))
}

/** The lead's name, or null when the team has none or the person is not known. */
export function getLeadName(team: TeamDto, names: Map<string, string>): string | null {
  return team.leadUserId ? (names.get(team.leadUserId) ?? null) : null
}

/** What the delete dialog has to ask: connections need a decision before the team can go. */
export function needsConnectionsDecision(impact: TeamDeletionImpactDto | undefined): boolean {
  return (impact?.connectionCount ?? 0) > 0
}

export function toSortParam(sort: string): { id: string; desc: boolean } {
  return { id: sort.replace(/^-/, ''), desc: sort.startsWith('-') }
}
