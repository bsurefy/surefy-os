// SPDX-License-Identifier: AGPL-3.0-only
import type { MemberEffectiveAccessDto, TeamEffectiveAccessDto } from '@surefy/contracts'
import type { HttpClient } from '@surefy/web-core/http'

/**
 * What another person or a team may do (Settings › Roles & access › Effective access). The signed-in
 * person's own access, which every gate reads, lives in `@surefy/web-core/api/access`.
 */
export const effectiveAccessApi = {
  member: (http: HttpClient, orgId: string, userId: string, signal?: AbortSignal) =>
    http.get<MemberEffectiveAccessDto>(`/orgs/${orgId}/access/members/${userId}`, { signal }),
  team: (http: HttpClient, orgId: string, teamId: string, signal?: AbortSignal) =>
    http.get<TeamEffectiveAccessDto>(`/orgs/${orgId}/access/teams/${teamId}`, { signal }),
}
