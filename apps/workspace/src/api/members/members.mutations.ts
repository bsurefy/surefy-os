// SPDX-License-Identifier: AGPL-3.0-only
import { useMutation, useQueryClient } from '@tanstack/react-query'

import type {
  BulkMemberActionInput,
  CreateInvitationInput,
  RemoveMemberQuery,
  UpdateMemberInput,
} from '@surefy/contracts'
import { apiClient } from '@surefy/web-core/http'
import type { MutationHookOptions } from '@surefy/web-core/query'

import { invitationsApi, membersApi } from './members.api'
import { memberKeys } from './members.queries'
import { teamKeys } from '../teams'

/** Every change to a person or an invitation refreshes both tables; team counts move with them. */
function useRefreshMembers(orgId: string) {
  const queryClient = useQueryClient()
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: memberKeys.all(orgId) }),
      queryClient.invalidateQueries({ queryKey: teamKeys.all(orgId) }),
    ])
}

export function useUpdateMemberMutation(
  orgId: string,
  { silent = false }: MutationHookOptions = {},
) {
  const refresh = useRefreshMembers(orgId)
  return useMutation({
    meta: { silent },
    mutationFn: ({ memberId, ...input }: UpdateMemberInput & { memberId: string }) =>
      membersApi.update(apiClient, orgId, memberId, input),
    onSuccess: refresh,
  })
}

export function useRemoveMemberMutation(
  orgId: string,
  { silent = false }: MutationHookOptions = {},
) {
  const refresh = useRefreshMembers(orgId)
  return useMutation({
    meta: { silent },
    mutationFn: ({ memberId, ...query }: RemoveMemberQuery & { memberId: string }) =>
      membersApi.remove(apiClient, orgId, memberId, query),
    onSuccess: refresh,
  })
}

export function useDeactivateMemberMutation(
  orgId: string,
  { silent = false }: MutationHookOptions = {},
) {
  const refresh = useRefreshMembers(orgId)
  return useMutation({
    meta: { silent },
    mutationFn: (memberId: string) => membersApi.deactivate(apiClient, orgId, memberId),
    onSuccess: refresh,
  })
}

export function useReactivateMemberMutation(
  orgId: string,
  { silent = false }: MutationHookOptions = {},
) {
  const refresh = useRefreshMembers(orgId)
  return useMutation({
    meta: { silent },
    mutationFn: (memberId: string) => membersApi.reactivate(apiClient, orgId, memberId),
    onSuccess: refresh,
  })
}

export function useBulkMemberActionMutation(
  orgId: string,
  { silent = false }: MutationHookOptions = {},
) {
  const refresh = useRefreshMembers(orgId)
  return useMutation({
    meta: { silent },
    mutationFn: (input: BulkMemberActionInput) => membersApi.bulk(apiClient, orgId, input),
    onSuccess: refresh,
  })
}

/** One request per address; each carries its own idempotency key. */
export function useCreateInvitationMutation(
  orgId: string,
  { silent = false }: MutationHookOptions = {},
) {
  const refresh = useRefreshMembers(orgId)
  return useMutation({
    meta: { silent },
    mutationFn: (input: CreateInvitationInput) =>
      invitationsApi.create(apiClient, orgId, input, crypto.randomUUID()),
    onSuccess: refresh,
  })
}

export function useResendInvitationMutation(
  orgId: string,
  { silent = false }: MutationHookOptions = {},
) {
  const refresh = useRefreshMembers(orgId)
  return useMutation({
    meta: { silent },
    mutationFn: (invitationId: string) => invitationsApi.resend(apiClient, orgId, invitationId),
    onSuccess: refresh,
  })
}

/** A fresh link, shown once; the previous one stops working. */
export function useCreateInvitationLinkMutation(
  orgId: string,
  { silent = false }: MutationHookOptions = {},
) {
  return useMutation({
    meta: { silent },
    mutationFn: (invitationId: string) => invitationsApi.link(apiClient, orgId, invitationId),
  })
}

export function useRevokeInvitationMutation(
  orgId: string,
  { silent = false }: MutationHookOptions = {},
) {
  const refresh = useRefreshMembers(orgId)
  return useMutation({
    meta: { silent },
    mutationFn: (invitationId: string) => invitationsApi.revoke(apiClient, orgId, invitationId),
    onSuccess: refresh,
  })
}
