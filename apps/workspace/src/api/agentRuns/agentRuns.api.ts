// SPDX-License-Identifier: AGPL-3.0-only
import type {
  AgentRunDetailDto,
  AgentRunDto,
  AgentRunStepDetailDto,
  AgentRunStepsDto,
  RetryAgentRunInput,
} from '@surefy/contracts'
import type { HttpClient } from '@surefy/web-core/http'

import type { AgentRunListFilters } from './agentRuns.queries'

/** Agent runs: one agent's run list, a run with its step trace, and the cancel and retry actions. */
export const agentRunsApi = {
  /** The runs of one agent; test runs are left out unless `isTest` asks for them. */
  list: (
    http: HttpClient,
    orgId: string,
    agentId: string,
    query: AgentRunListFilters,
    signal?: AbortSignal,
  ) =>
    http.getPage<AgentRunDto>(`/orgs/${orgId}/agents/${agentId}/runs`, {
      params: { ...query },
      signal,
    }),
  get: (http: HttpClient, orgId: string, runId: string, signal?: AbortSignal) =>
    http.get<AgentRunDetailDto>(`/orgs/${orgId}/runs/${runId}`, { signal }),
  steps: (http: HttpClient, orgId: string, runId: string, signal?: AbortSignal) =>
    http.get<AgentRunStepsDto>(`/orgs/${orgId}/runs/${runId}/steps`, { signal }),
  step: (http: HttpClient, orgId: string, runId: string, seq: number, signal?: AbortSignal) =>
    http.get<AgentRunStepDetailDto>(`/orgs/${orgId}/runs/${runId}/steps/${seq}`, { signal }),
  /** 202: the run is `canceled` once the worker stops; the answer is the run as it is now. */
  cancel: (http: HttpClient, orgId: string, runId: string) =>
    http.post<AgentRunDetailDto>(`/orgs/${orgId}/runs/${runId}/cancel`),
  /** A new queued run with the same input; the caller opens its event stream. */
  retry: (http: HttpClient, orgId: string, runId: string, input: RetryAgentRunInput) =>
    http.post<AgentRunDetailDto>(`/orgs/${orgId}/runs/${runId}/retry`, input),
}

/** The endpoint `useChat` posts to for a sandbox run of the draft; it answers with the event stream. */
export const testRunStreamPath = (orgId: string, agentId: string) =>
  `/orgs/${orgId}/agents/${agentId}/test-runs?stream=true`

/** The event stream of a run: a client reconnects to it, or follows a run it started elsewhere. */
export const runEventsPath = (orgId: string, runId: string) => `/orgs/${orgId}/runs/${runId}/events`
