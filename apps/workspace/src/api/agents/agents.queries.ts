// SPDX-License-Identifier: AGPL-3.0-only
import { infiniteQueryOptions, queryOptions } from '@tanstack/react-query'

import { PAGE_SIZE } from '@surefy/contracts'
import type { AgentStatus } from '@surefy/contracts'
import { apiClient } from '@surefy/web-core/http'
import type { HttpClient } from '@surefy/web-core/http'

import { agentsApi } from './agents.api'

/** Filters are single-valued: `HttpClient` params carry no arrays. */
export interface AgentListFilters {
  limit?: number
  cursor?: string
  q?: string
  /** One status; archived agents are listed only when this is `archived`. */
  status?: AgentStatus
  needsAttention?: boolean
  ownerId?: string
  mine?: boolean
  /** `lastRunAt`, `name`, `runsThisWeek`, with a leading `-` for descending. */
  sort?: string
}

export interface UsableAgentFilters {
  limit?: number
  cursor?: string
  q?: string
}

export interface AgentVersionListFilters {
  limit?: number
  cursor?: string
}

/** Query keys of the `agents` domain (services-api.md §3): the agents, their drafts and versions. */
export const agentKeys = {
  all: (orgId: string) => ['orgs', orgId, 'agents'] as const,
  lists: (orgId: string) => [...agentKeys.all(orgId), 'list'] as const,
  list: (orgId: string, filters: AgentListFilters) => [...agentKeys.lists(orgId), filters] as const,
  templates: (orgId: string) => [...agentKeys.all(orgId), 'templates'] as const,
  usable: (orgId: string, filters: UsableAgentFilters) =>
    [...agentKeys.all(orgId), 'usable', filters] as const,
  impact: (orgId: string, agentId: string, action: AgentImpactAction) =>
    [...agentKeys.detail(orgId, agentId), 'impact', action] as const,
  detail: (orgId: string, agentId: string) => [...agentKeys.all(orgId), 'detail', agentId] as const,
  versions: (orgId: string, agentId: string) =>
    [...agentKeys.detail(orgId, agentId), 'versions'] as const,
  liveVersion: (orgId: string, agentId: string, liveVersion: number) =>
    [...agentKeys.versions(orgId, agentId), 'live', liveVersion] as const,
  versionList: (orgId: string, agentId: string) =>
    [...agentKeys.versions(orgId, agentId), 'list'] as const,
  versionDetail: (orgId: string, agentId: string, versionId: string) =>
    [...agentKeys.versions(orgId, agentId), 'detail', versionId] as const,
  readiness: (orgId: string, agentId: string) =>
    [...agentKeys.detail(orgId, agentId), 'readiness'] as const,
  access: (orgId: string, agentId: string) =>
    [...agentKeys.detail(orgId, agentId), 'access'] as const,
}

// `http` defaults to the browser client; server components pass getServerHttpClient()
export type AgentImpactAction = 'pause' | 'archive' | 'delete'

export const agentQueries = {
  list: (orgId: string, filters: AgentListFilters, http: HttpClient = apiClient) =>
    infiniteQueryOptions({
      queryKey: agentKeys.list(orgId, filters),
      queryFn: ({ pageParam, signal }) =>
        agentsApi.list(
          http,
          orgId,
          { ...filters, limit: filters.limit ?? PAGE_SIZE.default, cursor: pageParam },
          signal,
        ),
      initialPageParam: undefined as string | undefined,
      getNextPageParam: (last) => last.nextCursor ?? undefined,
    }),
  /** Agents the person may talk to in Chat ("Agents shared with you", the picker's Agents tab). */
  usable: (orgId: string, filters: UsableAgentFilters, http: HttpClient = apiClient) =>
    infiniteQueryOptions({
      queryKey: agentKeys.usable(orgId, filters),
      queryFn: ({ pageParam, signal }) =>
        agentsApi.usable(
          http,
          orgId,
          { ...filters, limit: filters.limit ?? PAGE_SIZE.default, cursor: pageParam },
          signal,
        ),
      initialPageParam: undefined as string | undefined,
      getNextPageParam: (last) => last.nextCursor ?? undefined,
    }),
  templates: (orgId: string, http: HttpClient = apiClient) =>
    queryOptions({
      queryKey: agentKeys.templates(orgId),
      queryFn: ({ signal }) => agentsApi.templates(http, orgId, signal),
    }),
  /** Read when a dialog opens, so the consequence it names is the current one. */
  impact: (
    orgId: string,
    agentId: string,
    action: AgentImpactAction,
    http: HttpClient = apiClient,
  ) =>
    queryOptions({
      queryKey: agentKeys.impact(orgId, agentId, action),
      queryFn: ({ signal }) => agentsApi.impact(http, orgId, agentId, action, signal),
      staleTime: 0,
    }),
  detail: (orgId: string, agentId: string, http: HttpClient = apiClient) =>
    queryOptions({
      queryKey: agentKeys.detail(orgId, agentId),
      queryFn: ({ signal }) => agentsApi.get(http, orgId, agentId, signal),
    }),
  /**
   * The definition of the version that is live, for "N unpublished changes". Keyed by the live
   * version number, so a publish or a roll back reads it again. Null when it is not among the
   * newest versions.
   */
  liveVersion: (
    orgId: string,
    agentId: string,
    liveVersion: number,
    http: HttpClient = apiClient,
  ) =>
    queryOptions({
      queryKey: agentKeys.liveVersion(orgId, agentId, liveVersion),
      queryFn: async ({ signal }) => {
        const page = await agentsApi.versions(
          http,
          orgId,
          agentId,
          { limit: PAGE_SIZE.default },
          signal,
        )
        const live = page.items.find((version) => version.isLive)
        return live ? agentsApi.version(http, orgId, agentId, live.id, signal) : null
      },
    }),
  /** Every published version, newest first. */
  versionList: (orgId: string, agentId: string, http: HttpClient = apiClient) =>
    infiniteQueryOptions({
      queryKey: agentKeys.versionList(orgId, agentId),
      queryFn: ({ pageParam, signal }) =>
        agentsApi.versions(
          http,
          orgId,
          agentId,
          { limit: PAGE_SIZE.default, cursor: pageParam },
          signal,
        ),
      initialPageParam: undefined as string | undefined,
      getNextPageParam: (last) => last.nextCursor ?? undefined,
    }),
  /** One version with its definition; a published version never changes. */
  versionDetail: (
    orgId: string,
    agentId: string,
    versionId: string,
    http: HttpClient = apiClient,
  ) =>
    queryOptions({
      queryKey: agentKeys.versionDetail(orgId, agentId, versionId),
      queryFn: ({ signal }) => agentsApi.version(http, orgId, agentId, versionId, signal),
      staleTime: Infinity,
    }),
  readiness: (orgId: string, agentId: string, http: HttpClient = apiClient) =>
    queryOptions({
      queryKey: agentKeys.readiness(orgId, agentId),
      queryFn: ({ signal }) => agentsApi.readiness(http, orgId, agentId, signal),
    }),
  access: (orgId: string, agentId: string, http: HttpClient = apiClient) =>
    queryOptions({
      queryKey: agentKeys.access(orgId, agentId),
      queryFn: ({ signal }) => agentsApi.access(http, orgId, agentId, signal),
    }),
}
