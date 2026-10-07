// SPDX-License-Identifier: AGPL-3.0-only
import { useMutation, useQueryClient } from '@tanstack/react-query'

import type {
  AddTeamMembersInput,
  CreateTeamInput,
  DeleteTeamQuery,
  UpdateTeamInput,
} from '@surefy/contracts'
import { apiClient } from '@surefy/web-core/http'
import type { MutationHookOptions } from '@surefy/web-core/query'

import { teamsApi } from './teams.api'
import { teamKeys } from './teams.queries'
import { memberKeys } from '../members/members.queries'

/** Teams show on members (their team chips and primary team), so both domains refresh together. */
function useRefreshTeams(orgId: string) {
  const queryClient = useQueryClient()
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: teamKeys.all(orgId) }),
      queryClient.invalidateQueries({ queryKey: memberKeys.all(orgId) }),
    ])
}

export function useCreateTeamMutation(orgId: string, { silent = false }: MutationHookOptions = {}) {
  const refresh = useRefreshTeams(orgId)
  return useMutation({
    meta: { silent },
    mutationFn: (input: CreateTeamInput) => teamsApi.create(apiClient, orgId, input),
    onSuccess: refresh,
  })
}

export function useUpdateTeamMutation(orgId: string, { silent = false }: MutationHookOptions = {}) {
  const refresh = useRefreshTeams(orgId)
  return useMutation({
    meta: { silent },
    mutationFn: ({ teamId, ...input }: UpdateTeamInput & { teamId: string }) =>
      teamsApi.update(apiClient, orgId, teamId, input),
    onSuccess: refresh,
  })
}

export function useDeleteTeamMutation(orgId: string, { silent = false }: MutationHookOptions = {}) {
  const refresh = useRefreshTeams(orgId)
  return useMutation({
    meta: { silent },
    mutationFn: ({ teamId, ...query }: DeleteTeamQuery & { teamId: string }) =>
      teamsApi.delete(apiClient, orgId, teamId, query),
    onSuccess: refresh,
  })
}

export function useAddTeamMembersMutation(
  orgId: string,
  teamId: string,
  { silent = false }: MutationHookOptions = {},
) {
  const refresh = useRefreshTeams(orgId)
  return useMutation({
    meta: { silent },
    mutationFn: (input: AddTeamMembersInput) =>
      teamsApi.addMembers(apiClient, orgId, teamId, input),
    onSuccess: refresh,
  })
}

export function useRemoveTeamMemberMutation(
  orgId: string,
  teamId: string,
  { silent = false }: MutationHookOptions = {},
) {
  const refresh = useRefreshTeams(orgId)
  return useMutation({
    meta: { silent },
    mutationFn: (userId: string) => teamsApi.removeMember(apiClient, orgId, teamId, userId),
    onSuccess: refresh,
  })
}
