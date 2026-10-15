// SPDX-License-Identifier: AGPL-3.0-only
import { infiniteQueryOptions, queryOptions } from '@tanstack/react-query'

import { PAGE_SIZE } from '@surefy/contracts'
import type { AgentRunStatus, AgentRunTrigger } from '@surefy/contracts'
import { apiClient } from '@surefy/web-core/http'
import type { HttpClient } from '@surefy/web-core/http'

import { agentRunsApi } from './agentRuns.api'

/** One agent's run list; the API accepts several statuses, the screen offers one at a time. */
export interface AgentRunListFilters {
  q?: string
  status?: AgentRunStatus
  /** ISO date-times bounding `startedAt`. */
  from?: string
  to?: string
  isTest?: boolean
  neededHuman?: boolean
  limit?: number
  cursor?: string
}

/** The organization's run list (Insights › Runs): one agent's filters plus who, where and how. */
export interface RunListFilters extends AgentRunListFilters {
  agentId?: string
  trigger?: AgentRunTrigger
  teamId?: string
  modelKey?: string
  startedByUserId?: string
  /** `startedAt`, `durationMs` or `costMicros`, with a leading `-` for descending. */
  sort?: string
}

/** Query keys of the `agentRuns` domain (services-api.md §3): agent runs and their steps. */
export const agentRunKeys = {
  all: (orgId: string) => ['orgs', orgId, 'agent-runs'] as const,
  lists: (orgId: string) => [...agentRunKeys.all(orgId), 'list'] as const,
  listAll: (orgId: string, filters: RunListFilters) =>
    [...agentRunKeys.lists(orgId), 'all', filters] as const,
  list: (orgId: string, agentId: string, filters: AgentRunListFilters) =>
    [...agentRunKeys.lists(orgId), agentId, filters] as const,
  details: (orgId: string) => [...agentRunKeys.all(orgId), 'detail'] as const,
  detail: (orgId: string, runId: string) => [...agentRunKeys.details(orgId), runId] as const,
  steps: (orgId: string, runId: string) => [...agentRunKeys.detail(orgId, runId), 'steps'] as const,
  step: (orgId: string, runId: string, seq: number) =>
    [...agentRunKeys.steps(orgId, runId), seq] as const,
}

// `http` defaults to the browser client; server components pass getServerHttpClient()
export const agentRunQueries = {
  listAll: (orgId: string, filters: RunListFilters, http: HttpClient = apiClient) =>
    infiniteQueryOptions({
      queryKey: agentRunKeys.listAll(orgId, filters),
      queryFn: ({ pageParam, signal }) =>
        agentRunsApi.listAll(
          http,
          orgId,
          { ...filters, limit: filters.limit ?? PAGE_SIZE.default, cursor: pageParam },
          signal,
        ),
      initialPageParam: undefined as string | undefined,
      getNextPageParam: (last) => last.nextCursor ?? undefined,
    }),
  list: (
    orgId: string,
    agentId: string,
    filters: AgentRunListFilters,
    http: HttpClient = apiClient,
  ) =>
    infiniteQueryOptions({
      queryKey: agentRunKeys.list(orgId, agentId, filters),
      queryFn: ({ pageParam, signal }) =>
        agentRunsApi.list(
          http,
          orgId,
          agentId,
          { ...filters, limit: filters.limit ?? PAGE_SIZE.default, cursor: pageParam },
          signal,
        ),
      initialPageParam: undefined as string | undefined,
      getNextPageParam: (last) => last.nextCursor ?? undefined,
    }),
  detail: (orgId: string, runId: string, http: HttpClient = apiClient) =>
    queryOptions({
      queryKey: agentRunKeys.detail(orgId, runId),
      queryFn: ({ signal }) => agentRunsApi.get(http, orgId, runId, signal),
    }),
  steps: (orgId: string, runId: string, http: HttpClient = apiClient) =>
    queryOptions({
      queryKey: agentRunKeys.steps(orgId, runId),
      queryFn: ({ signal }) => agentRunsApi.steps(http, orgId, runId, signal),
    }),
  /** One step with its input and output; read when the step is opened. */
  step: (orgId: string, runId: string, seq: number, http: HttpClient = apiClient) =>
    queryOptions({
      queryKey: agentRunKeys.step(orgId, runId, seq),
      queryFn: ({ signal }) => agentRunsApi.step(http, orgId, runId, seq, signal),
    }),
}
