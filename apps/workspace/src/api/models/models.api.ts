// SPDX-License-Identifier: AGPL-3.0-only
import type {
  ModelAccessEntryDto,
  ModelAccessRuleDto,
  ModelImpactAction,
  ModelImpactDto,
  SetModelAccessInput,
  UpdateVaultModelInput,
  UpdateVaultSettingsInput,
  UsableModelDto,
  VaultModelDto,
  VaultSettingsDto,
} from '@surefy/contracts'
import type { HttpClient } from '@surefy/web-core/http'

import type {
  ModelAccessListFilters,
  UsableModelFilters,
  VaultModelListFilters,
} from './models.queries'

/** The models an organization can call, who may use them, the embedding model and the fallback order. */
export const modelsApi = {
  usable: (http: HttpClient, orgId: string, query: UsableModelFilters, signal?: AbortSignal) =>
    http.getPage<UsableModelDto>(`/orgs/${orgId}/models`, { params: { ...query }, signal }),
  list: (http: HttpClient, orgId: string, query: VaultModelListFilters, signal?: AbortSignal) =>
    http.getPage<VaultModelDto>(`/orgs/${orgId}/vault/models`, { params: { ...query }, signal }),
  update: (http: HttpClient, orgId: string, modelId: string, input: UpdateVaultModelInput) =>
    http.patch<VaultModelDto>(`/orgs/${orgId}/vault/models/${modelId}`, input),
  impact: (
    http: HttpClient,
    orgId: string,
    modelId: string,
    query: { action: ModelImpactAction; teamId?: string },
    signal?: AbortSignal,
  ) =>
    http.get<ModelImpactDto>(`/orgs/${orgId}/vault/models/${modelId}/impact`, {
      params: query,
      signal,
    }),
  access: (http: HttpClient, orgId: string, query: ModelAccessListFilters, signal?: AbortSignal) =>
    http.getPage<ModelAccessEntryDto>(`/orgs/${orgId}/vault/model-access`, {
      params: { ...query },
      signal,
    }),
  setAccess: (http: HttpClient, orgId: string, modelId: string, input: SetModelAccessInput) =>
    http.put<ModelAccessRuleDto[]>(`/orgs/${orgId}/vault/models/${modelId}/access`, input),
  settings: (http: HttpClient, orgId: string, signal?: AbortSignal) =>
    http.get<VaultSettingsDto>(`/orgs/${orgId}/vault/settings`, { signal }),
  updateSettings: (http: HttpClient, orgId: string, input: UpdateVaultSettingsInput) =>
    http.put<VaultSettingsDto>(`/orgs/${orgId}/vault/settings`, input),
}
