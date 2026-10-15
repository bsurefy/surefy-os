// SPDX-License-Identifier: AGPL-3.0-only
import type {
  AccessPolicyDto,
  MemberEffectiveAccessDto,
  TeamEffectiveAccessDto,
  UpdateAccessPolicyInput,
} from '@surefy/contracts'
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
  /** The restrictions a team sets for itself; the web search switch in Vault › Model access. */
  teamPolicy: (http: HttpClient, orgId: string, teamId: string, signal?: AbortSignal) =>
    http.get<AccessPolicyDto>(`/orgs/${orgId}/teams/${teamId}/access-policy`, { signal }),
  organizationPolicy: (http: HttpClient, orgId: string, signal?: AbortSignal) =>
    http.get<AccessPolicyDto>(`/orgs/${orgId}/access/policy`, { signal }),
  /** Replaces the team's whole policy document. */
  updateTeamPolicy: (
    http: HttpClient,
    orgId: string,
    teamId: string,
    input: UpdateAccessPolicyInput,
  ) => http.put<AccessPolicyDto>(`/orgs/${orgId}/teams/${teamId}/access-policy`, input),
}
