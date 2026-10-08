// SPDX-License-Identifier: AGPL-3.0-only
import type {
  AgentDetailDto,
  AgentDto,
  AgentVersionDetailDto,
  AgentVersionDto,
  SaveAgentDraftDto,
  SaveAgentDraftInput,
  UpdateAgentInput,
} from '@surefy/contracts'
import type { HttpClient } from '@surefy/web-core/http'

import type { AgentVersionListFilters } from './agents.queries'

/** Agents: the editor's agent with its draft, live metadata, and the versions it reads. */
export const agentsApi = {
  get: (http: HttpClient, orgId: string, agentId: string, signal?: AbortSignal) =>
    http.get<AgentDetailDto>(`/orgs/${orgId}/agents/${agentId}`, { signal }),
  /** Live metadata (name, description): saved directly and not versioned. */
  update: (http: HttpClient, orgId: string, agentId: string, input: UpdateAgentInput) =>
    http.patch<AgentDto>(`/orgs/${orgId}/agents/${agentId}`, input),
  /** Autosave. A moved draft answers `409 AGENT_EDIT_CONFLICT` and saves nothing. */
  saveDraft: (http: HttpClient, orgId: string, agentId: string, input: SaveAgentDraftInput) =>
    http.put<SaveAgentDraftDto>(`/orgs/${orgId}/agents/${agentId}/draft`, input),
  versions: (
    http: HttpClient,
    orgId: string,
    agentId: string,
    query: AgentVersionListFilters,
    signal?: AbortSignal,
  ) =>
    http.getPage<AgentVersionDto>(`/orgs/${orgId}/agents/${agentId}/versions`, {
      params: { ...query },
      signal,
    }),
  version: (
    http: HttpClient,
    orgId: string,
    agentId: string,
    versionId: string,
    signal?: AbortSignal,
  ) =>
    http.get<AgentVersionDetailDto>(`/orgs/${orgId}/agents/${agentId}/versions/${versionId}`, {
      signal,
    }),
}
