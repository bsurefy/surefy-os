// SPDX-License-Identifier: AGPL-3.0-only
import { infiniteQueryOptions, queryOptions } from '@tanstack/react-query'

import { PAGE_SIZE } from '@surefy/contracts'
import { apiClient } from '@surefy/web-core/http'
import type { HttpClient } from '@surefy/web-core/http'

import { agentsApi } from './agents.api'

export interface AgentVersionListFilters {
  limit?: number
  cursor?: string
}

/** Query keys of the `agents` domain (services-api.md §3): the agents, their drafts and versions. */
export const agentKeys = {
  all: (orgId: string) => ['orgs', orgId, 'agents'] as const,
  lists: (orgId: string) => [...agentKeys.all(orgId), 'list'] as const,
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
export const agentQueries = {
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
