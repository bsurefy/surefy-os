// SPDX-License-Identifier: AGPL-3.0-only
import { useMutation, useQueryClient } from '@tanstack/react-query'

import type {
  ConnectionTestInput,
  CreateCredentialInput,
  CreateLocalServerInput,
  CreatePersonalCredentialInput,
  UpdateCredentialInput,
} from '@surefy/contracts'
import { apiClient } from '@surefy/web-core/http'
import type { MutationHookOptions } from '@surefy/web-core/query'

import { vaultApi } from './vault.api'
import { vaultKeys } from './vault.queries'
import { modelKeys } from '../models/models.queries'

/**
 * Keys and servers decide which models exist and are available, and the access view reads both, so
 * the vault and models domains refresh together.
 */
function useRefreshVault(orgId: string) {
  const queryClient = useQueryClient()
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: vaultKeys.all(orgId) }),
      queryClient.invalidateQueries({ queryKey: modelKeys.all(orgId) }),
    ])
}

/** Tries a connection before anything is saved; stores nothing, so nothing refreshes. */
export function useTestConnectionMutation(
  orgId: string,
  { silent = false }: MutationHookOptions = {},
) {
  return useMutation({
    meta: { silent },
    mutationFn: (input: ConnectionTestInput) => vaultApi.testConnection(apiClient, orgId, input),
  })
}

export function useCreateCredentialMutation(
  orgId: string,
  { silent = false }: MutationHookOptions = {},
) {
  const refresh = useRefreshVault(orgId)
  return useMutation({
    meta: { silent },
    mutationFn: (input: CreateCredentialInput) =>
      vaultApi.createCredential(apiClient, orgId, input),
    onSuccess: refresh,
  })
}

export function useUpdateCredentialMutation(
  orgId: string,
  { silent = false }: MutationHookOptions = {},
) {
  const refresh = useRefreshVault(orgId)
  return useMutation({
    meta: { silent },
    mutationFn: ({ credentialId, ...input }: UpdateCredentialInput & { credentialId: string }) =>
      vaultApi.updateCredential(apiClient, orgId, credentialId, input),
    onSuccess: refresh,
  })
}

export function useTestCredentialMutation(
  orgId: string,
  { silent = false }: MutationHookOptions = {},
) {
  const refresh = useRefreshVault(orgId)
  return useMutation({
    meta: { silent },
    mutationFn: (credentialId: string) => vaultApi.testCredential(apiClient, orgId, credentialId),
    // a test updates the key's status and the models it serves
    onSuccess: refresh,
  })
}

export function useMakePrimaryMutation(
  orgId: string,
  { silent = false }: MutationHookOptions = {},
) {
  const refresh = useRefreshVault(orgId)
  return useMutation({
    meta: { silent },
    mutationFn: (credentialId: string) => vaultApi.makePrimary(apiClient, orgId, credentialId),
    onSuccess: refresh,
  })
}

export function useRevokeCredentialMutation(
  orgId: string,
  { silent = false }: MutationHookOptions = {},
) {
  const refresh = useRefreshVault(orgId)
  return useMutation({
    meta: { silent },
    mutationFn: (credentialId: string) => vaultApi.revoke(apiClient, orgId, credentialId),
    onSuccess: refresh,
  })
}

export function useCreateLocalServerMutation(
  orgId: string,
  { silent = false }: MutationHookOptions = {},
) {
  const refresh = useRefreshVault(orgId)
  return useMutation({
    meta: { silent },
    mutationFn: (input: CreateLocalServerInput) =>
      vaultApi.createLocalServer(apiClient, orgId, input),
    onSuccess: refresh,
  })
}

export function useRemoveLocalServerMutation(
  orgId: string,
  { silent = false }: MutationHookOptions = {},
) {
  const refresh = useRefreshVault(orgId)
  return useMutation({
    meta: { silent },
    mutationFn: (serverId: string) => vaultApi.removeLocalServer(apiClient, orgId, serverId),
    onSuccess: refresh,
  })
}

export function useSyncLocalServerMutation(
  orgId: string,
  { silent = false }: MutationHookOptions = {},
) {
  const refresh = useRefreshVault(orgId)
  return useMutation({
    meta: { silent },
    mutationFn: (serverId: string) => vaultApi.syncLocalServer(apiClient, orgId, serverId),
    onSuccess: refresh,
  })
}

/** A personal key, added from Profile › API keys. */
export function useCreatePersonalCredentialMutation(
  orgId: string,
  { silent = false }: MutationHookOptions = {},
) {
  const refresh = useRefreshVault(orgId)
  return useMutation({
    meta: { silent },
    mutationFn: (input: CreatePersonalCredentialInput) =>
      vaultApi.createPersonalCredential(apiClient, orgId, input),
    onSuccess: refresh,
  })
}
