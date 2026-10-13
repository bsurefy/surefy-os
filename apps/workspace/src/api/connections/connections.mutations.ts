// SPDX-License-Identifier: AGPL-3.0-only
import { useMutation, useQueryClient } from '@tanstack/react-query'

import type {
  CompleteOauthInput,
  CreateConnectionInput,
  ReconnectConnectionInput,
  StartOauthInput,
  UpdateConnectionInput,
} from '@surefy/contracts'
import { apiClient } from '@surefy/web-core/http'
import type { MutationHookOptions } from '@surefy/web-core/query'

import { connectionsApi } from './connections.api'
import { connectionKeys } from './connections.queries'

/** Anything that changes a connection changes the rows, the attention banner and the providers' counts. */
function useInvalidateConnections(orgId: string) {
  const queryClient = useQueryClient()
  return () => queryClient.invalidateQueries({ queryKey: connectionKeys.all(orgId) })
}

export function useCreateConnectionMutation(
  orgId: string,
  { silent = false }: MutationHookOptions = {},
) {
  const invalidate = useInvalidateConnections(orgId)
  return useMutation({
    meta: { silent },
    mutationFn: (input: CreateConnectionInput) => connectionsApi.create(apiClient, orgId, input),
    onSuccess: invalidate,
  })
}

export function useUpdateConnectionMutation(
  orgId: string,
  { silent = false }: MutationHookOptions = {},
) {
  const invalidate = useInvalidateConnections(orgId)
  return useMutation({
    meta: { silent },
    mutationFn: ({ id, ...input }: UpdateConnectionInput & { id: string }) =>
      connectionsApi.update(apiClient, orgId, id, input),
    onSuccess: invalidate,
  })
}

export function useReconnectConnectionMutation(
  orgId: string,
  { silent = false }: MutationHookOptions = {},
) {
  const invalidate = useInvalidateConnections(orgId)
  return useMutation({
    meta: { silent },
    mutationFn: ({ id, ...input }: ReconnectConnectionInput & { id: string }) =>
      connectionsApi.reconnect(apiClient, orgId, id, input),
    onSuccess: invalidate,
  })
}

/** A failed check is a normal answer (`ok: false`); the row's status changes either way. */
export function useTestConnectionMutation(
  orgId: string,
  { silent = false }: MutationHookOptions = {},
) {
  const invalidate = useInvalidateConnections(orgId)
  return useMutation({
    meta: { silent },
    mutationFn: (id: string) => connectionsApi.test(apiClient, orgId, id),
    onSuccess: invalidate,
  })
}

export function useRevokeConnectionMutation(
  orgId: string,
  { silent = false }: MutationHookOptions = {},
) {
  const invalidate = useInvalidateConnections(orgId)
  return useMutation({
    meta: { silent },
    mutationFn: (id: string) => connectionsApi.revoke(apiClient, orgId, id),
    onSuccess: invalidate,
  })
}

export function useStartConnectionOauthMutation(
  orgId: string,
  { silent = false }: MutationHookOptions = {},
) {
  return useMutation({
    meta: { silent },
    mutationFn: (input: StartOauthInput) => connectionsApi.startOauth(apiClient, orgId, input),
  })
}

export function useCompleteConnectionOauthMutation(
  orgId: string,
  { silent = false }: MutationHookOptions = {},
) {
  const invalidate = useInvalidateConnections(orgId)
  return useMutation({
    meta: { silent },
    mutationFn: (input: CompleteOauthInput) =>
      connectionsApi.completeOauth(apiClient, orgId, input),
    onSuccess: invalidate,
  })
}
