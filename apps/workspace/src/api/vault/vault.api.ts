// SPDX-License-Identifier: AGPL-3.0-only
import type {
  ConnectionTestDto,
  ConnectionTestInput,
  CreateCredentialInput,
  CreateLocalServerInput,
  CreatePersonalCredentialInput,
  CreateSearchProviderInput,
  CredentialDto,
  CredentialImpactAction,
  CredentialImpactDto,
  LocalServerSyncDto,
  ProviderCardDto,
  SearchProviderSettingsDto,
  UpdateCredentialInput,
} from '@surefy/contracts'
import type { HttpClient } from '@surefy/web-core/http'

import type { CredentialListFilters, MyCredentialListFilters } from './vault.queries'

/** Provider keys, local servers and the key lifecycle (Settings › Vault, Profile › API keys). */
export const vaultApi = {
  providers: (http: HttpClient, orgId: string, signal?: AbortSignal) =>
    http.get<ProviderCardDto[]>(`/orgs/${orgId}/vault/providers`, { signal }),
  credentials: (
    http: HttpClient,
    orgId: string,
    query: CredentialListFilters,
    signal?: AbortSignal,
  ) =>
    http.getPage<CredentialDto>(`/orgs/${orgId}/vault/credentials`, {
      params: { ...query },
      signal,
    }),
  searchProviders: (http: HttpClient, orgId: string, signal?: AbortSignal) =>
    http.get<SearchProviderSettingsDto>(`/orgs/${orgId}/vault/search-providers`, { signal }),
  createSearchProvider: (http: HttpClient, orgId: string, input: CreateSearchProviderInput) =>
    http.post<CredentialDto>(`/orgs/${orgId}/vault/search-providers`, input),
  testConnection: (http: HttpClient, orgId: string, input: ConnectionTestInput) =>
    http.post<ConnectionTestDto>(`/orgs/${orgId}/vault/connection-tests`, input),
  createCredential: (http: HttpClient, orgId: string, input: CreateCredentialInput) =>
    http.post<CredentialDto>(`/orgs/${orgId}/vault/credentials`, input),
  updateCredential: (
    http: HttpClient,
    orgId: string,
    credentialId: string,
    input: UpdateCredentialInput,
  ) => http.patch<CredentialDto>(`/orgs/${orgId}/vault/credentials/${credentialId}`, input),
  testCredential: (http: HttpClient, orgId: string, credentialId: string) =>
    http.post<ConnectionTestDto>(`/orgs/${orgId}/vault/credentials/${credentialId}/test`),
  makePrimary: (http: HttpClient, orgId: string, credentialId: string) =>
    http.post<CredentialDto>(`/orgs/${orgId}/vault/credentials/${credentialId}/make-primary`),
  revoke: (http: HttpClient, orgId: string, credentialId: string) =>
    http.post<CredentialDto>(`/orgs/${orgId}/vault/credentials/${credentialId}/revoke`),
  credentialImpact: (
    http: HttpClient,
    orgId: string,
    credentialId: string,
    action: CredentialImpactAction,
    signal?: AbortSignal,
  ) =>
    http.get<CredentialImpactDto>(`/orgs/${orgId}/vault/credentials/${credentialId}/impact`, {
      params: { action },
      signal,
    }),
  createLocalServer: (http: HttpClient, orgId: string, input: CreateLocalServerInput) =>
    http.post<CredentialDto>(`/orgs/${orgId}/vault/local-servers`, input),
  removeLocalServer: (http: HttpClient, orgId: string, serverId: string) =>
    http.delete(`/orgs/${orgId}/vault/local-servers/${serverId}`),
  localServerImpact: (http: HttpClient, orgId: string, serverId: string, signal?: AbortSignal) =>
    http.get<CredentialImpactDto>(`/orgs/${orgId}/vault/local-servers/${serverId}/impact`, {
      signal,
    }),
  syncLocalServer: (http: HttpClient, orgId: string, serverId: string) =>
    http.post<LocalServerSyncDto>(`/orgs/${orgId}/vault/local-servers/${serverId}/sync`),
  myCredentials: (
    http: HttpClient,
    orgId: string,
    query: MyCredentialListFilters,
    signal?: AbortSignal,
  ) =>
    http.getPage<CredentialDto>(`/orgs/${orgId}/vault/my-credentials`, {
      params: { ...query },
      signal,
    }),
  createPersonalCredential: (
    http: HttpClient,
    orgId: string,
    input: CreatePersonalCredentialInput,
  ) => http.post<CredentialDto>(`/orgs/${orgId}/vault/my-credentials`, input),
}
