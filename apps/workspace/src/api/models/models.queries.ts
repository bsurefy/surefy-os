// SPDX-License-Identifier: AGPL-3.0-only
import { infiniteQueryOptions, queryOptions } from '@tanstack/react-query'

import { PAGE_SIZE } from '@surefy/contracts'
import type {
  ModelImpactAction,
  ModelPickerSource,
  ModelType,
  VaultModelSource,
  VaultModelStatus,
} from '@surefy/contracts'
import { apiClient } from '@surefy/web-core/http'
import type { HttpClient } from '@surefy/web-core/http'

import { modelsApi } from './models.api'

export interface UsableModelFilters {
  q?: string
  type?: ModelType
  source?: ModelPickerSource
  limit?: number
  cursor?: string
}

export interface VaultModelListFilters {
  q?: string
  type?: ModelType
  source?: VaultModelSource
  status?: VaultModelStatus
  providerKey?: string
  /** Models of one local server. */
  serverId?: string
  isEnabled?: boolean
  /** `displayName`, `-displayName`, `createdAt` or `-createdAt`. */
  sort?: string
  limit?: number
  cursor?: string
}

export interface ModelAccessListFilters {
  q?: string
  type?: ModelType
  isEnabled?: boolean
  limit?: number
  cursor?: string
}

/** Query keys of the `models` domain (services-api.md §3): models, who may use them, settings. */
export const modelKeys = {
  all: (orgId: string) => ['orgs', orgId, 'models'] as const,
  usable: (orgId: string, filters: UsableModelFilters) =>
    [...modelKeys.all(orgId), 'usable', filters] as const,
  lists: (orgId: string) => [...modelKeys.all(orgId), 'list'] as const,
  list: (orgId: string, filters: VaultModelListFilters) =>
    [...modelKeys.lists(orgId), filters] as const,
  impact: (orgId: string, modelId: string, action: ModelImpactAction, teamId?: string) =>
    [...modelKeys.all(orgId), 'impact', modelId, action, teamId ?? null] as const,
  access: (orgId: string, filters: ModelAccessListFilters) =>
    [...modelKeys.all(orgId), 'access', filters] as const,
  settings: (orgId: string) => [...modelKeys.all(orgId), 'settings'] as const,
}

// `http` defaults to the browser client; server components pass getServerHttpClient()
export const modelQueries = {
  usable: (orgId: string, filters: UsableModelFilters, http: HttpClient = apiClient) =>
    infiniteQueryOptions({
      queryKey: modelKeys.usable(orgId, filters),
      queryFn: ({ pageParam, signal }) =>
        modelsApi.usable(
          http,
          orgId,
          { ...filters, limit: filters.limit ?? PAGE_SIZE.default, cursor: pageParam },
          signal,
        ),
      initialPageParam: undefined as string | undefined,
      getNextPageParam: (last) => last.nextCursor ?? undefined,
    }),
  list: (orgId: string, filters: VaultModelListFilters, http: HttpClient = apiClient) =>
    infiniteQueryOptions({
      queryKey: modelKeys.list(orgId, filters),
      queryFn: ({ pageParam, signal }) =>
        modelsApi.list(
          http,
          orgId,
          { ...filters, limit: filters.limit ?? PAGE_SIZE.default, cursor: pageParam },
          signal,
        ),
      initialPageParam: undefined as string | undefined,
      getNextPageParam: (last) => last.nextCursor ?? undefined,
    }),
  impact: (
    orgId: string,
    modelId: string,
    action: ModelImpactAction,
    teamId?: string,
    http: HttpClient = apiClient,
  ) =>
    queryOptions({
      queryKey: modelKeys.impact(orgId, modelId, action, teamId),
      queryFn: ({ signal }) => modelsApi.impact(http, orgId, modelId, { action, teamId }, signal),
      // the counts must be the ones at the moment of confirming
      gcTime: 0,
    }),
  access: (orgId: string, filters: ModelAccessListFilters, http: HttpClient = apiClient) =>
    infiniteQueryOptions({
      queryKey: modelKeys.access(orgId, filters),
      queryFn: ({ pageParam, signal }) =>
        modelsApi.access(
          http,
          orgId,
          { ...filters, limit: filters.limit ?? PAGE_SIZE.default, cursor: pageParam },
          signal,
        ),
      initialPageParam: undefined as string | undefined,
      getNextPageParam: (last) => last.nextCursor ?? undefined,
    }),
  settings: (orgId: string, http: HttpClient = apiClient) =>
    queryOptions({
      queryKey: modelKeys.settings(orgId),
      queryFn: ({ signal }) => modelsApi.settings(http, orgId, signal),
    }),
}
