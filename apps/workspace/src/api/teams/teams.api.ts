// SPDX-License-Identifier: AGPL-3.0-only
import type {
  AddTeamMembersInput,
  AddTeamMembersResultDto,
  CreateTeamInput,
  DeleteTeamQuery,
  TeamDeletionImpactDto,
  TeamDto,
  TeamMemberDto,
  UpdateTeamInput,
} from '@surefy/contracts'
import type { HttpClient } from '@surefy/web-core/http'

import type { TeamListFilters, TeamMemberListFilters } from './teams.queries'

/** Teams and their members (Settings › Teams). */
export const teamsApi = {
  list: (http: HttpClient, orgId: string, query: TeamListFilters, signal?: AbortSignal) =>
    http.getPage<TeamDto>(`/orgs/${orgId}/teams`, { params: { ...query }, signal }),
  get: (http: HttpClient, orgId: string, teamId: string, signal?: AbortSignal) =>
    http.get<TeamDto>(`/orgs/${orgId}/teams/${teamId}`, { signal }),
  create: (http: HttpClient, orgId: string, input: CreateTeamInput) =>
    http.post<TeamDto>(`/orgs/${orgId}/teams`, input),
  update: (http: HttpClient, orgId: string, teamId: string, input: UpdateTeamInput) =>
    http.patch<TeamDto>(`/orgs/${orgId}/teams/${teamId}`, input),
  delete: (http: HttpClient, orgId: string, teamId: string, query: DeleteTeamQuery) =>
    http.delete(`/orgs/${orgId}/teams/${teamId}`, { params: query }),
  deletionImpact: (http: HttpClient, orgId: string, teamId: string, signal?: AbortSignal) =>
    http.get<TeamDeletionImpactDto>(`/orgs/${orgId}/teams/${teamId}/deletion-impact`, { signal }),
  members: (
    http: HttpClient,
    orgId: string,
    teamId: string,
    query: TeamMemberListFilters,
    signal?: AbortSignal,
  ) =>
    http.getPage<TeamMemberDto>(`/orgs/${orgId}/teams/${teamId}/members`, {
      params: { ...query },
      signal,
    }),
  addMembers: (http: HttpClient, orgId: string, teamId: string, input: AddTeamMembersInput) =>
    http.post<AddTeamMembersResultDto>(`/orgs/${orgId}/teams/${teamId}/members`, input),
  removeMember: (http: HttpClient, orgId: string, teamId: string, userId: string) =>
    http.delete(`/orgs/${orgId}/teams/${teamId}/members/${userId}`),
}
