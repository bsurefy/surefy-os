// SPDX-License-Identifier: AGPL-3.0-only
import { infiniteQueryOptions, queryOptions } from '@tanstack/react-query'

import { PAGE_SIZE } from '@surefy/contracts'
import type { CredentialKind, CredentialScope, CredentialStatus } from '@surefy/contracts'
import { apiClient } from '@surefy/web-core/http'
import type { HttpClient } from '@surefy/web-core/http'

import { vaultApi } from './vault.api'

export interface CredentialListFilters {
  q?: string
  kind?: CredentialKind
  scope?: CredentialScope
  status?: CredentialStatus
  providerKey?: string
  teamId?: string
  /** `name`, `-name`, `createdAt`, `-createdAt`, `lastUsedAt` or `-lastUsedAt`. */
  sort?: string
  limit?: number
  cursor?: string
}

export interface MyCredentialListFilters {
  limit?: number
  cursor?: string
}

/** Query keys of the `vault` domain (services-api.md §3): provider keys and local servers. */
export const vaultKeys = {
  all: (orgId: string) => ['orgs', orgId, 'vault'] as const,
  providers: (orgId: string) => [...vaultKeys.all(orgId), 'providers'] as const,
  credentialLists: (orgId: string) => [...vaultKeys.all(orgId), 'credentials'] as const,
  credentialList: (orgId: string, filters: CredentialListFilters) =>
    [...vaultKeys.credentialLists(orgId), filters] as const,
  credentialImpact: (orgId: string, credentialId: string, action: string) =>
    [...vaultKeys.all(orgId), 'credential-impact', credentialId, action] as const,
  localServerImpact: (orgId: string, serverId: string) =>
    [...vaultKeys.all(orgId), 'local-server-impact', serverId] as const,
  myCredentials: (orgId: string, filters: MyCredentialListFilters) =>
    [...vaultKeys.all(orgId), 'my-credentials', filters] as const,
}

// `http` defaults to the browser client; server components pass getServerHttpClient()
export const vaultQueries = {
  providers: (orgId: string, http: HttpClient = apiClient) =>
    queryOptions({
      queryKey: vaultKeys.providers(orgId),
      queryFn: ({ signal }) => vaultApi.providers(http, orgId, signal),
    }),
  credentials: (orgId: string, filters: CredentialListFilters, http: HttpClient = apiClient) =>
    infiniteQueryOptions({
      queryKey: vaultKeys.credentialList(orgId, filters),
      queryFn: ({ pageParam, signal }) =>
        vaultApi.credentials(
          http,
          orgId,
          { ...filters, limit: filters.limit ?? PAGE_SIZE.default, cursor: pageParam },
          signal,
        ),
      initialPageParam: undefined as string | undefined,
      getNextPageParam: (last) => last.nextCursor ?? undefined,
    }),
  credentialImpact: (
    orgId: string,
    credentialId: string,
    action: 'revoke' | 'switch',
    http: HttpClient = apiClient,
  ) =>
    queryOptions({
      queryKey: vaultKeys.credentialImpact(orgId, credentialId, action),
      queryFn: ({ signal }) => vaultApi.credentialImpact(http, orgId, credentialId, action, signal),
      // the counts must be the ones at the moment of confirming
      gcTime: 0,
    }),
  localServerImpact: (orgId: string, serverId: string, http: HttpClient = apiClient) =>
    queryOptions({
      queryKey: vaultKeys.localServerImpact(orgId, serverId),
      queryFn: ({ signal }) => vaultApi.localServerImpact(http, orgId, serverId, signal),
      gcTime: 0,
    }),
  myCredentials: (orgId: string, filters: MyCredentialListFilters, http: HttpClient = apiClient) =>
    infiniteQueryOptions({
      queryKey: vaultKeys.myCredentials(orgId, filters),
      queryFn: ({ pageParam, signal }) =>
        vaultApi.myCredentials(
          http,
          orgId,
          { ...filters, limit: filters.limit ?? PAGE_SIZE.default, cursor: pageParam },
          signal,
        ),
      initialPageParam: undefined as string | undefined,
      getNextPageParam: (last) => last.nextCursor ?? undefined,
    }),
}
